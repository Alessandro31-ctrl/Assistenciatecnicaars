// ==========================================
// CONFIGURAÇÃO DO FIREBASE
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyAPy_lq_k9xtH2b7VyxeEObeO-1ChiZMXo",
  authDomain: "assistencia-tecnica-ars.firebaseapp.com",
  projectId: "assistencia-tecnica-ars",
  storageBucket: "assistencia-tecnica-ars.firebasestorage.app",
  messagingSenderId: "173444750561",
  appId: "1:173444750561:web:399ffcbd030a26eaa16ba0",
  measurementId: "G-XR19TE1XYZ"
};

// Inicializa Firebase
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();

let clientesData = [];
let estoqueData = [];
let orcamentosData = [];
let osData = [];
let vendasData = [];
let insumosData = [];

let itemSelecionado = null;
let chartFinancasInstance = null;
let chartLucroPieInstance = null;
let insumoSelecionado = null;

// ==========================================
// CONTROLE DE AUTENTICAÇÃO E INICIALIZAÇÃO
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  const hoje = new Date().toISOString().split('T')[0];
  if (document.getElementById('orc-data')) document.getElementById('orc-data').value = hoje;
  if (document.getElementById('os-data')) document.getElementById('os-data').value = hoje;
  if (document.getElementById('venda-data')) document.getElementById('venda-data').value = hoje;

  // Monitora o estado da sessão do Firebase
  auth.onAuthStateChanged(user => {
    if (user) {
      document.getElementById('login-screen').style.display = 'none';
      document.getElementById('app-wrapper').style.display = 'flex';
      carregarTodosDados();
    } else {
      document.getElementById('login-screen').style.display = 'flex';
      document.getElementById('app-wrapper').style.display = 'none';
    }
  });
});

async function autenticarUsuario(e) {
  if (e) e.preventDefault();

  const emailInput = document.getElementById('login-email');
  const senhaInput = document.getElementById('login-senha');

  const email = emailInput ? emailInput.value.trim() : '';
  const senha = senhaInput ? senhaInput.value : '';

  if (!email || !senha) {
    alert("Por favor, preencha o e-mail e a senha.");
    return;
  }

  try {
    const userCredential = await auth.signInWithEmailAndPassword(email, senha);
    console.log("Usuário autenticado:", userCredential.user);
  } catch (error) {
    console.error("Erro na autenticação:", error);
    let mensagem = "Falha ao realizar login.";
    if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
      mensagem = "E-mail ou senha incorretos!";
    } else if (error.code === 'auth/invalid-email') {
      mensagem = "E-mail digitado é inválido!";
    } else if (error.code === 'auth/too-many-requests') {
      mensagem = "Muitas tentativas sem sucesso. Aguarde um instante.";
    } else {
      mensagem = `Erro (${error.code}): ${error.message}`;
    }
    alert(mensagem);
  }
}

function fazerLogout() {
  auth.signOut();
}

function navigate(pagina) {
  document.querySelectorAll('.page-section').forEach(sec => sec.classList.remove('active'));
  document.querySelectorAll('.nav-btn, .mobile-nav-btn').forEach(btn => btn.classList.remove('active'));

  document.getElementById(`sec-${pagina}`).classList.add('active');

  document.querySelectorAll(`.nav-btn[onclick="navigate('${pagina}')"]`).forEach(b => b.classList.add('active'));
  document.querySelectorAll(`.mobile-nav-btn[onclick="navigate('${pagina}')"]`).forEach(b => b.classList.add('active'));

  if (pagina === 'dashboard') carregarDashboard();
}

// ==========================================
// HELPERS FIRESTORE (REMPLAÇAM O APIFETCH)
// ==========================================
async function getCollectionData(colecao) {
  try {
    const snapshot = await db.collection(colecao).get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (err) {
    console.error(`Erro ao carregar coleção ${colecao}:`, err);
    return [];
  }
}

async function saveDocument(colecao, id, dados) {
  if (id) {
    await db.collection(colecao).doc(String(id)).update(dados);
    return id;
  } else {
    const ref = await db.collection(colecao).add(dados);
    return ref.id;
  }
}

async function deleteDocument(colecao, id) {
  await db.collection(colecao).doc(String(id)).delete();
}

async function carregarTodosDados() {
  await Promise.all([
    carregarClientes(),
    carregarEstoque(),
    carregarOrcamentos(),
    carregarOS(),
    carregarVendas(),
    carregarInsumos()
  ]);
  carregarDashboard();
}

function pertenceAoPeriodo(dataStr, mesFiltro, anoFiltro) {
  if (!dataStr) return true;
  let ano = '', mes = '';

  if (dataStr.includes('-')) {
    const partes = dataStr.split('T')[0].split('-');
    ano = partes[0]; mes = partes[1];
  } else if (dataStr.includes('/')) {
    const partes = dataStr.split('/');
    ano = partes[2]; mes = partes[1];
  }

  if (anoFiltro && ano !== anoFiltro) return false;
  if (mesFiltro && mes !== mesFiltro) return false;
  return true;
}

// ==========================================
// DASHBOARD
// ==========================================
async function carregarDashboard() {
  const mes = document.getElementById('dash-filter-mes')?.value || '';
  const ano = document.getElementById('dash-filter-ano')?.value || new Date().getFullYear().toString();

  let totalEntradaVendas = 0;
  let lucroMaoObra = 0;
  let lucroPecas = 0;
  let custoPecasVendidas = 0;
  let qtdMaoObra = 0;

  const ordensFiltradas = (osData || []).filter(os => pertenceAoPeriodo(os.data || os.dataDoc || os.created_at, mes, ano));

  ordensFiltradas.forEach(os => {
    const valMaoObra = parseFloat(os.valor_mao_obra || os.valMaoObra || os.maoObra || 0);
    if (valMaoObra > 0) {
      lucroMaoObra += valMaoObra;
      qtdMaoObra += 1;
    }
  });

  const vendasFiltradas = (vendasData || []).filter(v => pertenceAoPeriodo(v.data || v.dataDoc || v.created_at, mes, ano));
  let totalQtdPecasVendidas = 0;

  vendasFiltradas.forEach(v => {
    const totalVenda = parseFloat(v.valor_total || v.valorTotal || v.total || 0);
    totalEntradaVendas += totalVenda;

    let pecasArray = v.pecas_json || v.itens || [];
    if (typeof pecasArray === 'string') {
      try { pecasArray = JSON.parse(pecasArray); } catch (e) { pecasArray = []; }
    }

    if (pecasArray.length > 0) {
      pecasArray.forEach(item => {
        const qtd = parseFloat(item.quantidade || item.qtd || 1);
        totalQtdPecasVendidas += qtd;
        let precoVendaItem = parseFloat(item.preco_venda || item.precoVenda || item.preco_unitario || item.valor_unitario || 0);

        if (precoVendaItem === 0 && totalVenda > 0) {
          precoVendaItem = totalVenda / pecasArray.length;
        }

        let precoCustoItem = parseFloat(item.preco_custo || item.precoCusto || 0);
        if (precoCustoItem === 0 && (item.id || item.peca_id)) {
          const itemEstoque = (estoqueData || []).find(e => String(e.id) === String(item.id || item.peca_id));
          if (itemEstoque) precoCustoItem = parseFloat(itemEstoque.preco_custo || 0);
        }

        const custoTotalDesteItem = precoCustoItem * qtd;
        custoPecasVendidas += custoTotalDesteItem;
        const lucroUnitario = precoVendaItem - precoCustoItem;
        lucroPecas += (lucroUnitario * qtd);
      });
    } else {
      lucroPecas += totalVenda;
      totalQtdPecasVendidas += 1;
    }
  });

  let custoEntradaEstoqueMes = 0;
  let totalCustoLoja = 0;
  let totalCustoCliente = 0;

  (estoqueData || []).forEach(item => {
    const dataEntradaPeca = item.data_entrada || item.created_at || item.data;
    const precoCusto = parseFloat(item.preco_custo || 0);
    const qtdEntrada = parseFloat(item.quantidade || item.qtd_entrada || 1);
    const custoItem = precoCusto * qtdEntrada;

    if (pertenceAoPeriodo(dataEntradaPeca, mes, ano)) {
      custoEntradaEstoqueMes += custoItem;
      const tipoItem = (item.tipo || '').toString().trim().toLowerCase();
      if (tipoItem === 'loja') totalCustoLoja += custoItem;
      else totalCustoCliente += custoItem;
    }
  });

  const lucroTotal = lucroMaoObra + lucroPecas;
  const custoTotalGeralPecas = custoPecasVendidas;
  const totalEntradaFaturamento = lucroTotal + custoPecasVendidas;

  if (document.getElementById('lbl-dash-entrada')) document.getElementById('lbl-dash-entrada').innerText = `R$ ${totalEntradaFaturamento.toFixed(2)}`;
  if (document.getElementById('lbl-dash-entrada-lucro')) document.getElementById('lbl-dash-entrada-lucro').innerText = `R$ ${lucroTotal.toFixed(2)}`;
  if (document.getElementById('lbl-dash-entrada-custo')) document.getElementById('lbl-dash-entrada-custo').innerText = `R$ ${custoPecasVendidas.toFixed(2)}`;
  if (document.getElementById('card-pecas-entrada')) document.getElementById('card-pecas-entrada').innerText = `R$ ${custoPecasVendidas.toFixed(2)}`;
  if (document.getElementById('lbl-dash-mao-obra')) document.getElementById('lbl-dash-mao-obra').innerText = `R$ ${lucroMaoObra.toFixed(2)}`;
  if (document.getElementById('lbl-dash-lucro-pecas')) document.getElementById('lbl-dash-lucro-pecas').innerText = `R$ ${lucroPecas.toFixed(2)}`;
  if (document.getElementById('lbl-dash-qtd-mao-obra')) document.getElementById('lbl-dash-qtd-mao-obra').innerText = qtdMaoObra;
  if (document.getElementById('lbl-dash-pecas-qtd-vendas')) document.getElementById('lbl-dash-pecas-qtd-vendas').innerText = totalQtdPecasVendidas;
  if (document.getElementById('card-lucro-bruto')) document.getElementById('card-lucro-bruto').innerText = `R$ ${lucroTotal.toFixed(2)}`;
  if (document.getElementById('lbl-dash-custo-saida-geral')) document.getElementById('lbl-dash-custo-saida-geral').innerText = `R$ ${custoTotalGeralPecas.toFixed(2)}`;
  if (document.getElementById('lbl-dash-custo-loja-saida')) document.getElementById('lbl-dash-custo-loja-saida').innerText = `R$ ${totalCustoLoja.toFixed(2)}`;
  if (document.getElementById('lbl-dash-custo-cliente-saida')) document.getElementById('lbl-dash-custo-cliente-saida').innerText = `R$ ${totalCustoCliente.toFixed(2)}`;
  if (document.getElementById('lbl-dash-qtd-clientes')) document.getElementById('lbl-dash-qtd-clientes').innerText = (clientesData || []).length;

  atualizarCardsPainel(ordensFiltradas, estoqueData, insumosData || [], mes, ano, lucroTotal);
  renderizarGraficos(totalEntradaFaturamento, custoPecasVendidas, lucroTotal, lucroMaoObra, lucroPecas);
  renderizarLinhaDoTempo(ordensFiltradas, vendasFiltradas);
}

function atualizarCardsPainel(listaOS, listaEstoque, listaInsumos = [], mes = '', ano = '', lucroBrutoCalculado = 0) {
  const estoque = Array.isArray(listaEstoque) ? listaEstoque : [];
  const insumos = Array.isArray(listaInsumos) ? listaInsumos : [];
  const vendas = Array.isArray(vendasData) ? vendasData : [];

  const ehDoPeriodo = (dataStr) => {
    if (!mes || !ano) return true;
    if (!dataStr) return false;
    const d = new Date(dataStr);
    if (isNaN(d.getTime())) return true;
    return (d.getMonth() + 1) === parseInt(mes, 10) && d.getFullYear() === parseInt(ano, 10);
  };

  const totalEntradaEstoqueLoja = estoque
    .filter(item => {
      const tipo = (item.tipo || item.categoria || '').toString().trim().toLowerCase();
      return (tipo === 'loja' || tipo === 'balcao' || tipo === 'revenda') && ehDoPeriodo(item.data_entrada || item.created_at || item.data);
    })
    .reduce((acc, item) => acc + (parseFloat(item.preco_custo || 0) * parseFloat(item.quantidade || 1)), 0);

  let totalSaidaCustoLoja = 0;
  vendas.filter(v => ehDoPeriodo(v.data || v.created_at)).forEach(v => {
    let pecasArray = v.pecas_json || v.itens || [];
    if (typeof pecasArray === 'string') try { pecasArray = JSON.parse(pecasArray); } catch(e) { pecasArray = []; }

    pecasArray.forEach(item => {
      const qtd = parseFloat(item.quantidade || 1);
      let precoCustoItem = parseFloat(item.preco_custo || 0);
      const pecaEstoque = estoque.find(e => String(e.id) === String(item.id || item.peca_id));
      if (precoCustoItem === 0 && pecaEstoque) precoCustoItem = parseFloat(pecaEstoque.preco_custo || 0);
      const tipoPeca = pecaEstoque ? (pecaEstoque.tipo || '').toString().trim().toLowerCase() : 'loja';
      if (tipoPeca === 'loja' || tipoPeca === 'balcao') totalSaidaCustoLoja += (precoCustoItem * qtd);
    });
  });

  const saldoInvestimentoEstoqueLoja = totalEntradaEstoqueLoja - totalSaidaCustoLoja;

  const totalEstoqueVenda = estoque
    .filter(item => (item.tipo || '').toLowerCase() !== 'insumo' && parseFloat(item.quantidade || 0) > 0)
    .reduce((acc, item) => acc + (parseFloat(item.quantidade || 0) * parseFloat(item.preco_venda || 0)), 0);

  const totalInsumos = insumos
    .filter(item => ehDoPeriodo(item.data || item.data_entrada))
    .reduce((acc, item) => acc + (parseFloat(item.quantidade || 1) * parseFloat(item.preco_custo || 0)), 0);

  const lucroLiquidoLivre = parseFloat(lucroBrutoCalculado || 0) - (totalInsumos + saldoInvestimentoEstoqueLoja);

  const atualizarTexto = (id, valor) => {
    const el = document.getElementById(id);
    if (el) el.innerText = `R$ ${valor.toFixed(2)}`;
  };

  atualizarTexto('card-investimento-estoque-loja', saldoInvestimentoEstoqueLoja);
  atualizarTexto('lbl-dash-estoque-entrada', totalEntradaEstoqueLoja);
  atualizarTexto('lbl-dash-estoque-saida', totalSaidaCustoLoja);
  atualizarTexto('card-estoque-venda', totalEstoqueVenda);
  atualizarTexto('card-investimento-insumos', totalInsumos);
  atualizarTexto('card-lucro-liquido', lucroLiquidoLivre);
}

function renderizarLinhaDoTempo(ordens, vendas) {
  const container = document.getElementById('dash-timeline-list');
  if (!container) return;
  const eventos = [];

  (ordens || []).forEach(os => {
    eventos.push({
      data: os.data || '',
      titulo: `Ordem de Serviço #${os.id || ''}`,
      descricao: `Cliente: ${os.cliente_nome || 'N/I'} - Mão de Obra: R$ ${parseFloat(os.valor_mao_obra || 0).toFixed(2)}`,
      icone: '🔧'
    });
  });

  (vendas || []).forEach(v => {
    eventos.push({
      data: v.data || '',
      titulo: `Venda #${v.id || ''}`,
      descricao: `Total: R$ ${parseFloat(v.valor_total || 0).toFixed(2)}`,
      icone: '🛒'
    });
  });

  eventos.sort((a, b) => new Date(b.data) - new Date(a.data));

  if (eventos.length === 0) {
    container.innerHTML = '<li>Nenhuma atividade recente registrada.</li>';
    return;
  }

  container.innerHTML = eventos.map(e => `
    <li class="timeline-item">
      <span class="timeline-icon">${e.icone}</span>
      <div class="timeline-content">
        <strong>${e.titulo}</strong>
        <p>${e.descricao}</p>
        <small>${e.data}</small>
      </div>
    </li>
  `).join('');
}

function renderizarGraficos(entrada, custo, lucroTotal, maoObra, lucroPecas) {
  const ctxBar = document.getElementById('chartFinancas')?.getContext('2d');
  if (ctxBar) {
    if (chartFinancasInstance) chartFinancasInstance.destroy();
    chartFinancasInstance = new Chart(ctxBar, {
      type: 'bar',
      data: {
        labels: ['Faturamento', 'Custos', 'Lucro Líquido'],
        datasets: [{ label: 'Valores (R$)', data: [entrada, custo, lucroTotal], backgroundColor: ['#0284c7', '#ea580c', '#16a34a'] }]
      },
      options: { responsive: true, plugins: { legend: { display: false } } }
    });
  }

  const ctxPie = document.getElementById('chartLucroPie')?.getContext('2d');
  if (ctxPie) {
    if (chartLucroPieInstance) chartLucroPieInstance.destroy();
    chartLucroPieInstance = new Chart(ctxPie, {
      type: 'doughnut',
      data: {
        labels: ['Mão de Obra', 'Peças / Acessórios'],
        datasets: [{ data: [maoObra, lucroPecas], backgroundColor: ['#9333ea', '#0d9488'] }]
      },
      options: { responsive: true }
    });
  }
}

// ==========================================
// CLIENTES
// ==========================================
async function carregarClientes() {
  clientesData = await getCollectionData('clientes');
  renderTabelaClientes();
  atualizarSelectsClientes();
}

function renderTabelaClientes() {
  const tbody = document.querySelector('#tabela-clientes tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  clientesData.forEach(c => {
    const qtdServicos = vendasData.filter(v => String(v.cliente_id) === String(c.id)).length;
    const tr = document.createElement('tr');
    tr.onclick = () => abrirModalClienteOpts(c);
    tr.innerHTML = `
      <td>${c.id}</td>
      <td>${c.nome}</td>
      <td>${c.telefone || '-'}</td>
      <td>${c.cpf || '-'}</td>
      <td>${c.endereco || '-'}</td>
      <td>${c.status || 'Ativo'}</td>
      <td>${qtdServicos}</td>
    `;
    tbody.appendChild(tr);
  });
}

async function salvarCliente(e) {
  e.preventDefault();
  const id = document.getElementById('cli-id').value;
  const body = {
    nome: document.getElementById('cli-nome').value,
    telefone: document.getElementById('cli-telefone').value,
    cpf: document.getElementById('cli-cpf').value,
    endereco: document.getElementById('cli-endereco').value,
    status: document.getElementById('cli-status').value
  };

  await saveDocument('clientes', id, body);
  document.getElementById('form-cliente').reset();
  document.getElementById('cli-id').value = '';
  await carregarClientes();
}

function abrirModalClienteOpts(cliente) {
  itemSelecionado = cliente;
  document.getElementById('modal-cliente-opts').classList.add('active');
}

function editarCliente() {
  const c = itemSelecionado;
  document.getElementById('cli-id').value = c.id;
  document.getElementById('cli-nome').value = c.nome;
  document.getElementById('cli-telefone').value = c.telefone || '';
  document.getElementById('cli-cpf').value = c.cpf || '';
  document.getElementById('cli-endereco').value = c.endereco || '';
  document.getElementById('cli-status').value = c.status || 'Ativo';
  fecharModais();
}

async function excluirCliente() {
  if (confirm(`Deseja excluir o cliente ${itemSelecionado.nome}?`)) {
    await deleteDocument('clientes', itemSelecionado.id);
    fecharModais();
    await carregarClientes();
  }
}

function atualizarSelectsClientes() {
  const options = clientesData.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
  ['orc-cliente', 'os-cliente', 'venda-cliente'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `<option value="">Selecione o Cliente</option>` + options;
  });
}

// ==========================================
// ESTOQUE
// ==========================================
async function carregarEstoque() {
  estoqueData = await getCollectionData('estoque');
  renderTabelaEstoque();
}

function formatarDataBR(dataStr) {
  if (!dataStr) return '-';
  const apenasData = dataStr.split('T')[0];
  const partes = apenasData.split('-');
  return partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : dataStr;
}

function renderTabelaEstoque(dadosFiltrados = null) {
  const tbody = document.querySelector('#tabela-estoque tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const lista = dadosFiltrados || estoqueData || [];

  lista.forEach(e => {
    const qtdEntrada = parseInt(e.quantidade || 0, 10);
    let qtdSaida = 0;

    if (Array.isArray(vendasData)) {
      vendasData.forEach(v => {
        let pecas = v.pecas_json || [];
        if (typeof pecas === 'string') try { pecas = JSON.parse(pecas); } catch (err) { pecas = []; }
        pecas.forEach(p => {
          if (String(p.peca_id || p.id) === String(e.id)) {
            qtdSaida += parseInt(p.quantidade || 0, 10);
          }
        });
      });
    }

    const saldo = qtdEntrada - qtdSaida;
    const precoCusto = parseFloat(e.preco_custo || 0);
    const precoVenda = parseFloat(e.preco_venda || 0);
    const margem = (precoVenda - precoCusto).toFixed(2);

    const tr = document.createElement('tr');
    tr.onclick = () => abrirModalEstoque(e);
    const corSaldo = saldo <= 0 ? 'color: red;' : 'color: green;';

    tr.innerHTML = `
      <td>${e.id}</td>
      <td>${e.descricao || ''}</td>
      <td>${qtdEntrada}</td>
      <td>${qtdSaida}</td>
      <td><strong style="${corSaldo}">${saldo}</strong></td>
      <td>R$ ${precoCusto.toFixed(2)}</td>
      <td>R$ ${precoVenda.toFixed(2)}</td>
      <td>R$ ${margem}</td>
      <td>${e.tipo || ''}</td>
      <td>${e.disponibilidade || ''}</td>
      <td>${formatarDataBR(e.data_entrada || e.created_at)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function filtrarEstoque(termo) {
  if (!termo) return renderTabelaEstoque();
  const termoLower = termo.toLowerCase();
  const filtrados = (estoqueData || []).filter(item =>
    (item.descricao || '').toLowerCase().includes(termoLower) ||
    String(item.id).includes(termoLower) ||
    (item.tipo || '').toLowerCase().includes(termoLower)
  );
  renderTabelaEstoque(filtrados);
}

function abrirModalEstoque(item = null) {
  itemSelecionado = item;
  document.getElementById('form-estoque').reset();

  if (item) {
    document.getElementById('est-modal-title').innerText = "Editar Peça / Acessório";
    document.getElementById('est-id').value = item.id;
    document.getElementById('est-descricao').value = item.descricao;
    document.getElementById('est-preco-custo').value = item.preco_custo;
    document.getElementById('est-preco-venda').value = item.preco_venda;
    document.getElementById('est-quantidade').value = item.quantidade;
    document.getElementById('est-fornecedor').value = item.fornecedor || '';
    document.getElementById('est-categoria').value = item.categoria || '';
    document.getElementById('est-tipo').value = item.tipo || 'Loja';
    document.getElementById('est-disponibilidade').value = item.disponibilidade || 'Físico';
    document.getElementById('est-observacoes').value = item.observacoes || '';
    document.getElementById('est-data-entrada').value = item.data_entrada ? item.data_entrada.split('T')[0] : '';
    document.getElementById('btn-del-est').style.display = 'inline-block';
  } else {
    document.getElementById('est-modal-title').innerText = "Cadastrar Peça / Acessório";
    document.getElementById('est-id').value = '';
    document.getElementById('est-data-entrada').value = new Date().toISOString().split('T')[0];
    document.getElementById('btn-del-est').style.display = 'none';
  }

  document.getElementById('modal-estoque').classList.add('active');
}

async function salvarEstoque(e) {
  if (e) e.preventDefault();
  const id = document.getElementById('est-id').value;
  const body = {
    descricao: document.getElementById('est-descricao').value,
    preco_custo: parseFloat(document.getElementById('est-preco-custo').value || 0),
    preco_venda: parseFloat(document.getElementById('est-preco-venda').value || 0),
    quantidade: parseInt(document.getElementById('est-quantidade').value || 0, 10),
    fornecedor: document.getElementById('est-fornecedor').value,
    categoria: document.getElementById('est-categoria').value,
    tipo: document.getElementById('est-tipo').value,
    disponibilidade: document.getElementById('est-disponibilidade').value,
    data_entrada: document.getElementById('est-data-entrada').value,
    observacoes: document.getElementById('est-observacoes').value
  };

  await saveDocument('estoque', id, body);
  fecharModais();
  await carregarEstoque();
}

async function excluirEstoque() {
  if (itemSelecionado && confirm("Deseja excluir este item do estoque?")) {
    await deleteDocument('estoque', itemSelecionado.id);
    fecharModais();
    await carregarEstoque();
  }
}

// ==========================================
// PEÇAS NOS MODAIS
// ==========================================
function adicionarLinhaPeca(containerId, pecaId = '', qtd = 1) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'peca-row';

  let optionsPecas = `<option value="">Mão de Obra Somente</option>`;
  estoqueData.forEach(e => {
    const selected = String(e.id) === String(pecaId) ? 'selected' : '';
    optionsPecas += `<option value="${e.id}" data-preco="${e.preco_venda}" ${selected}>${e.descricao} (R$ ${parseFloat(e.preco_venda).toFixed(2)})</option>`;
  });

  row.innerHTML = `
    <select class="peca-select" onchange="calcularTotaisModal('${containerId}')">${optionsPecas}</select>
    <input type="number" class="peca-qtd" value="${qtd}" min="1" style="width: 70px;" onchange="calcularTotaisModal('${containerId}')">
    <button type="button" class="btn-danger" onclick="this.parentElement.remove(); calcularTotaisModal('${containerId}')">X</button>
  `;

  container.appendChild(row);
  calcularTotaisModal(containerId);
}

function extrairPecasContainer(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return { pecas: [], valorPecas: 0 };
  const rows = container.querySelectorAll('.peca-row');
  const pecas = [];
  let valorPecas = 0;

  rows.forEach(r => {
    const select = r.querySelector('.peca-select');
    const qtdInput = r.querySelector('.peca-qtd');
    const pecaId = select.value;
    const qtd = parseInt(qtdInput.value || 1, 10);

    if (pecaId) {
      const option = select.options[select.selectedIndex];
      const precoVenda = parseFloat(option.getAttribute('data-preco') || 0);
      const pecaEstoque = (estoqueData || []).find(e => String(e.id) === String(pecaId));
      const precoCusto = pecaEstoque ? parseFloat(pecaEstoque.preco_custo || 0) : 0;

      valorPecas += precoVenda * qtd;
      pecas.push({
        peca_id: pecaId,
        id: pecaId,
        descricao: option.text.split(' (R$')[0],
        quantidade: qtd,
        preco_venda: precoVenda,
        preco_custo: precoCusto,
        valor_unitario: precoVenda
      });
    }
  });

  return { pecas, valorPecas };
}

function calcularTotaisModal(containerId) {
  const { valorPecas } = extrairPecasContainer(containerId);

  if (containerId === 'container-pecas-orc') {
    if (document.getElementById('lbl-orc-val-pecas')) document.getElementById('lbl-orc-val-pecas').innerText = valorPecas.toFixed(2);
    calcularTotalOrcamento();
  } else if (containerId === 'container-pecas-os') {
    if (document.getElementById('lbl-os-val-pecas')) document.getElementById('lbl-os-val-pecas').innerText = valorPecas.toFixed(2);
    calcularTotalOS();
  } else if (containerId === 'container-pecas-venda') {
    if (document.getElementById('lbl-venda-val-total')) document.getElementById('lbl-venda-val-total').innerText = valorPecas.toFixed(2);
  }
}

// ==========================================
// ORÇAMENTOS
// ==========================================
async function carregarOrcamentos() {
  orcamentosData = await getCollectionData('orcamentos');
  renderTabelaOrcamentos();
}

function renderTabelaOrcamentos() {
  const tbody = document.querySelector('#tabela-orcamentos tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  orcamentosData.forEach(o => {
    const tr = document.createElement('tr');
    tr.onclick = () => abrirModalOrcamento(o);
    tr.innerHTML = `
      <td>${o.id}</td>
      <td>${o.cliente_nome || '-'}</td>
      <td>${o.problema || '-'}</td>
      <td>${o.solucao || '-'}</td>
      <td>R$ ${(o.valor_pecas || 0).toFixed(2)}</td>
      <td>R$ ${(o.valor_mao_obra || 0).toFixed(2)}</td>
      <td>R$ ${(o.valor_total || 0).toFixed(2)}</td>
      <td>${o.data || '-'}</td>
    `;
    tbody.appendChild(tr);
  });
}

function calcularTotalOrcamento() {
  const valPecas = parseFloat(document.getElementById('lbl-orc-val-pecas')?.innerText || 0);
  const valMaoObra = parseFloat(document.getElementById('orc-mao-obra')?.value || 0);
  if (document.getElementById('lbl-orc-val-total')) document.getElementById('lbl-orc-val-total').innerText = (valPecas + valMaoObra).toFixed(2);
}

function abrirModalOrcamento(item = null) {
  itemSelecionado = item;
  document.getElementById('form-orcamento').reset();
  document.getElementById('container-pecas-orc').innerHTML = '';

  if (item) {
    document.getElementById('orc-id').value = item.id;
    document.getElementById('orc-cliente').value = item.cliente_id;
    document.getElementById('orc-aparelho').value = item.aparelho || '';
    document.getElementById('orc-data').value = item.data;
    document.getElementById('orc-mao-obra').value = item.valor_mao_obra;
    document.getElementById('orc-problema').value = item.problema || '';
    document.getElementById('orc-solucao').value = item.solucao || '';
    document.getElementById('orc-observacoes').value = item.observacoes || '';

    let pecas = item.pecas_json || [];
    if (typeof pecas === 'string') try { pecas = JSON.parse(pecas); } catch(e){}
    pecas.forEach(p => adicionarLinhaPeca('container-pecas-orc', p.peca_id, p.quantidade));

    document.getElementById('btn-fat-orc').style.display = 'inline-block';
    document.getElementById('btn-pdf-orc').style.display = 'inline-block';
    document.getElementById('btn-del-orc').style.display = 'inline-block';
  } else {
    document.getElementById('orc-id').value = '';
    document.getElementById('btn-fat-orc').style.display = 'none';
    document.getElementById('btn-pdf-orc').style.display = 'none';
    document.getElementById('btn-del-orc').style.display = 'none';
  }

  calcularTotaisModal('container-pecas-orc');
  document.getElementById('modal-orcamento').classList.add('active');
}

async function salvarOrcamento(e) {
  e.preventDefault();
  const id = document.getElementById('orc-id').value;
  const clienteSelect = document.getElementById('orc-cliente');
  const clienteNome = clienteSelect.options[clienteSelect.selectedIndex].text;

  const { pecas, valorPecas } = extrairPecasContainer('container-pecas-orc');
  const valorMaoObra = parseFloat(document.getElementById('orc-mao-obra').value || 0);

  const body = {
    cliente_id: clienteSelect.value,
    cliente_nome: clienteNome,
    aparelho: document.getElementById('orc-aparelho').value,
    data: document.getElementById('orc-data').value,
    valor_mao_obra: valorMaoObra,
    valor_pecas: valorPecas,
    valor_total: valorPecas + valorMaoObra,
    problema: document.getElementById('orc-problema').value,
    solucao: document.getElementById('orc-solucao').value,
    observacoes: document.getElementById('orc-observacoes').value,
    pecas_json: pecas
  };

  await saveDocument('orcamentos', id, body);
  fecharModais();
  await carregarOrcamentos();
}

async function excluirOrcamento() {
  if (confirm("Deseja excluir este orçamento?")) {
    await deleteDocument('orcamentos', itemSelecionado.id);
    fecharModais();
    await carregarOrcamentos();
  }
}

function faturarOrcamento() {
  const o = itemSelecionado;
  fecharModais();
  abrirModalVenda();
  document.getElementById('venda-cliente').value = o.cliente_id;
  document.getElementById('venda-aparelho').value = o.aparelho || '';
  document.getElementById('venda-tipo').value = 'Venda por Orçamento';
  document.getElementById('venda-observacoes').value = `Faturado do Orçamento #${o.id}.${o.observacoes || ''}`;

  let pecas = o.pecas_json || [];
  if (typeof pecas === 'string') try { pecas = JSON.parse(pecas); } catch(e){}
  pecas.forEach(p => adicionarLinhaPeca('container-pecas-venda', p.peca_id, p.quantidade));
  calcularTotaisModal('container-pecas-venda');
}

// ==========================================
// OS (ORDEM DE SERVIÇO)
// ==========================================
async function carregarOS() {
  osData = await getCollectionData('os');
  renderTabelaOS();
}

function renderTabelaOS() {
  const tbody = document.querySelector('#tabela-os tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  osData.forEach(o => {
    const tr = document.createElement('tr');
    tr.onclick = () => abrirModalOS(o);
    tr.innerHTML = `
      <td>${o.id}</td>
      <td>${o.cliente_nome || '-'}</td>
      <td>${o.problema || '-'}</td>
      <td>${o.solucao || '-'}</td>
      <td>R$ ${(o.valor_pecas || 0).toFixed(2)}</td>
      <td>R$ ${(o.valor_mao_obra || 0).toFixed(2)}</td>
      <td>R$ ${(o.valor_total || 0).toFixed(2)}</td>
      <td>${o.data || '-'}</td>
      <td>${o.status}</td>
    `;
    tbody.appendChild(tr);
  });
}

function calcularTotalOS() {
  const valPecas = parseFloat(document.getElementById('lbl-os-val-pecas')?.innerText || 0);
  const valMaoObra = parseFloat(document.getElementById('os-mao-obra')?.value || 0);
  if (document.getElementById('lbl-os-val-total')) document.getElementById('lbl-os-val-total').innerText = (valPecas + valMaoObra).toFixed(2);
}

function abrirModalOS(item = null) {
  itemSelecionado = item;
  document.getElementById('form-os').reset();
  document.getElementById('container-pecas-os').innerHTML = '';

  if (item) {
    document.getElementById('os-id').value = item.id;
    document.getElementById('os-cliente').value = item.cliente_id;
    document.getElementById('os-aparelho').value = item.aparelho || '';
    document.getElementById('os-data').value = item.data;
    document.getElementById('os-status').value = item.status;
    document.getElementById('os-mao-obra').value = item.valor_mao_obra;
    document.getElementById('os-problema').value = item.problema || '';
    document.getElementById('os-solucao').value = item.solucao || '';
    document.getElementById('os-observacoes').value = item.observacoes || '';

    let pecas = item.pecas_json || [];
    if (typeof pecas === 'string') try { pecas = JSON.parse(pecas); } catch(e){}
    pecas.forEach(p => adicionarLinhaPeca('container-pecas-os', p.peca_id, p.quantidade));

    document.getElementById('btn-fat-os').style.display = 'inline-block';
    document.getElementById('btn-pdf-os').style.display = 'inline-block';
    document.getElementById('btn-del-os').style.display = 'inline-block';
  } else {
    document.getElementById('os-id').value = '';
    document.getElementById('btn-fat-os').style.display = 'none';
    document.getElementById('btn-pdf-os').style.display = 'none';
    document.getElementById('btn-del-os').style.display = 'none';
  }

  calcularTotaisModal('container-pecas-os');
  document.getElementById('modal-os').classList.add('active');
}

async function salvarOS(e) {
  e.preventDefault();
  const id = document.getElementById('os-id').value;
  const clienteSelect = document.getElementById('os-cliente');
  const clienteNome = clienteSelect.options[clienteSelect.selectedIndex].text;

  const { pecas, valorPecas } = extrairPecasContainer('container-pecas-os');
  const valorMaoObra = parseFloat(document.getElementById('os-mao-obra').value || 0);

  const body = {
    cliente_id: clienteSelect.value,
    cliente_nome: clienteNome,
    aparelho: document.getElementById('os-aparelho').value,
    data: document.getElementById('os-data').value,
    status: document.getElementById('os-status').value,
    valor_mao_obra: valorMaoObra,
    valor_pecas: valorPecas,
    valor_total: valorPecas + valorMaoObra,
    problema: document.getElementById('os-problema').value,
    solucao: document.getElementById('os-solucao').value,
    observacoes: document.getElementById('os-observacoes').value,
    pecas_json: pecas
  };

  await saveDocument('os', id, body);
  fecharModais();
  await carregarOS();
}

async function excluirOS() {
  if (confirm("Deseja excluir esta OS?")) {
    await deleteDocument('os', itemSelecionado.id);
    fecharModais();
    await carregarOS();
  }
}

function faturarOS() {
  const o = itemSelecionado;
  fecharModais();
  abrirModalVenda();
  document.getElementById('venda-cliente').value = o.cliente_id;
  document.getElementById('venda-aparelho').value = o.aparelho || '';
  document.getElementById('venda-tipo').value = 'Venda por OS';
  document.getElementById('venda-observacoes').value = `Faturado da OS #${o.id}.${o.observacoes || ''}`;

  let pecas = o.pecas_json || [];
  if (typeof pecas === 'string') try { pecas = JSON.parse(pecas); } catch(e){}
  pecas.forEach(p => adicionarLinhaPeca('container-pecas-venda', p.peca_id, p.quantidade));
  calcularTotaisModal('container-pecas-venda');
}

// ==========================================
// VENDAS
// ==========================================
async function carregarVendas() {
  vendasData = await getCollectionData('vendas');
  renderTabelaVendas();
}

function renderTabelaVendas() {
  const tbody = document.querySelector('#tabela-vendas tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  vendasData.forEach(v => {
    const tr = document.createElement('tr');
    tr.onclick = () => abrirModalVenda(v);
    tr.innerHTML = `
      <td>${v.id}</td>
      <td>${v.cliente_nome || '-'}</td>
      <td>${v.tipo_venda}</td>
      <td>R$ ${(v.valor_pecas || 0).toFixed(2)}</td>
      <td>R$ ${(v.valor_total || 0).toFixed(2)}</td>
      <td>${v.data || '-'}</td>
    `;
    tbody.appendChild(tr);
  });
}

function abrirModalVenda(item = null) {
  itemSelecionado = item;
  document.getElementById('form-venda').reset();
  document.getElementById('container-pecas-venda').innerHTML = '';

  if (item) {
    document.getElementById('venda-id').value = item.id;
    document.getElementById('venda-cliente').value = item.cliente_id;
    document.getElementById('venda-aparelho').value = item.aparelho || '';
    document.getElementById('venda-data').value = item.data;
    document.getElementById('venda-tipo').value = item.tipo_venda;
    document.getElementById('venda-observacoes').value = item.observacoes || '';

    let pecas = item.pecas_json || [];
    if (typeof pecas === 'string') try { pecas = JSON.parse(pecas); } catch(e){}
    pecas.forEach(p => adicionarLinhaPeca('container-pecas-venda', p.peca_id, p.quantidade));

    document.getElementById('btn-pdf-venda').style.display = 'inline-block';
    document.getElementById('btn-del-venda').style.display = 'inline-block';
  } else {
    document.getElementById('venda-id').value = '';
    document.getElementById('btn-pdf-venda').style.display = 'none';
    document.getElementById('btn-del-venda').style.display = 'none';
  }

  calcularTotaisModal('container-pecas-venda');
  document.getElementById('modal-venda').classList.add('active');
}

async function salvarVenda(e) {
  e.preventDefault();
  const id = document.getElementById('venda-id').value;
  const clienteSelect = document.getElementById('venda-cliente');
  const clienteNome = clienteSelect.options[clienteSelect.selectedIndex].text;

  const { pecas, valorPecas } = extrairPecasContainer('container-pecas-venda');

  const body = {
    cliente_id: clienteSelect.value,
    cliente_nome: clienteNome,
    aparelho: document.getElementById('venda-aparelho').value,
    data: document.getElementById('venda-data').value,
    tipo_venda: document.getElementById('venda-tipo').value,
    valor_pecas: valorPecas,
    valor_total: valorPecas,
    observacoes: document.getElementById('venda-observacoes').value,
    pecas_json: pecas
  };

  await saveDocument('vendas', id, body);
  fecharModais();
  await carregarVendas();
  await carregarEstoque();
  await carregarDashboard();
}

async function excluirVenda() {
  if (!itemSelecionado) return;
  if (confirm('Tem certeza que deseja excluir esta venda?')) {
    await deleteDocument('vendas', itemSelecionado.id);
    fecharModais();
    await carregarVendas();
    await carregarEstoque();
    await carregarDashboard();
  }
}

// ==========================================
// INSUMOS
// ==========================================
async function carregarInsumos() {
  insumosData = await getCollectionData('insumos');
  renderTabelaInsumos();
}

function renderTabelaInsumos() {
  const tbody = document.querySelector('#tabela-insumos tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  insumosData.forEach(i => {
    const tr = document.createElement('tr');
    tr.onclick = () => abrirModalInsumo(i);
    tr.innerHTML = `
      <td>${i.id}</td>
      <td>${i.descricao}</td>
      <td>${i.quantidade}</td>
      <td>R$ ${parseFloat(i.preco_custo || 0).toFixed(2)}</td>
      <td>${i.fornecedor || '-'}</td>
      <td>${formatarDataBR(i.data || i.data_entrada)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function abrirModalInsumo(item = null) {
  insumoSelecionado = item;
  document.getElementById('formInsumo').reset();

  if (item) {
    document.getElementById('ins-modal-title').innerText = "Editar Insumo";
    document.getElementById('ins-id').value = item.id;
    document.getElementById('ins-descricao').value = item.descricao;
    document.getElementById('ins-quantidade').value = item.quantidade;
    document.getElementById('ins-preco-custo').value = item.preco_custo;
    document.getElementById('ins-fornecedor').value = item.fornecedor || '';
    document.getElementById('ins-data').value = item.data ? item.data.split('T')[0] : (item.data_entrada ? item.data_entrada.split('T')[0] : '');
    document.getElementById('btnExcluirInsumo').style.display = 'inline-block';
  } else {
    document.getElementById('ins-modal-title').innerText = "Cadastrar Insumo";
    document.getElementById('ins-id').value = '';
    document.getElementById('ins-data').value = new Date().toISOString().split('T')[0];
    document.getElementById('btnExcluirInsumo').style.display = 'none';
  }

  document.getElementById('modal-insumo').classList.add('active');
}

async function salvarInsumo(e) {
  if (e) e.preventDefault();
  const id = document.getElementById('ins-id').value;
  const body = {
    descricao: document.getElementById('ins-descricao').value,
    quantidade: parseInt(document.getElementById('ins-quantidade').value || 1, 10),
    preco_custo: parseFloat(document.getElementById('ins-preco-custo').value || 0),
    fornecedor: document.getElementById('ins-fornecedor').value,
    data: document.getElementById('ins-data').value,
    data_entrada: document.getElementById('ins-data').value
  };

  await saveDocument('insumos', id, body);
  fecharModais();
  await carregarInsumos();
  await carregarDashboard();
}

async function excluirInsumo() {
  if (insumoSelecionado && confirm("Deseja excluir este insumo?")) {
    await deleteDocument('insumos', insumoSelecionado.id);
    fecharModais();
    await carregarInsumos();
    await carregarDashboard();
  }
}

// ==========================================
// UTILITÁRIOS E IMPRESSÃO
// ==========================================
function fecharModais() {
  document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
}

function filtrarTabela(tabelaId, termo) {
  const trs = document.querySelectorAll(`#${tabelaId} tbody tr`);
  const termLower = termo.toLowerCase();
  trs.forEach(tr => {
    tr.style.display = tr.innerText.toLowerCase().includes(termLower) ? '' : 'none';
  });
}

function exportarRelatorioCSV() {
  const csvContent = "data:text/csv;charset=utf-8,"
    + "Indicador,Valor\n"
    + `Entrada,${document.getElementById('lbl-dash-entrada').innerText}\n`
    + `Lucro Bruto,${document.getElementById('card-lucro-bruto').innerText}\n`
    + `Lucro Liquido Livre,${document.getElementById('card-lucro-liquido').innerText}\n`;

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", "relatorio_financeiro.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function gerarPDFOS() {
  const selectCliente = document.getElementById('os-cliente');
  const nomeCliente = selectCliente ? selectCliente.options[selectCliente.selectedIndex]?.text : 'AO CONSUMIDOR';
  const itens = [];
  const linhasPecas = document.querySelectorAll('#container-pecas-os .peca-row');

  linhasPecas.forEach((linha, index) => {
    const selectPeca = linha.querySelector('select');
    const inputQtd = linha.querySelector('input[type="number"]');
    const descPeca = selectPeca ? selectPeca.options[selectPeca.selectedIndex]?.text || 'Peça / Componente' : 'Peça';
    const qtd = inputQtd ? parseFloat(inputQtd.value) || 1 : 1;
    let valorUnitario = 0;
    if (selectPeca && selectPeca.options[selectPeca.selectedIndex]) {
      valorUnitario = parseFloat(selectPeca.options[selectPeca.selectedIndex].getAttribute('data-preco')) || 0;
    }
    itens.push({
      codigo: String(index + 1).padStart(4, '0'),
      descricao: descPeca,
      qtd: qtd,
      un: 'UN',
      valorUnitario: valorUnitario,
      total: qtd * valorUnitario
    });
  });

  const valMaoObra = parseFloat(document.getElementById('os-mao-obra')?.value) || 0;
  if (valMaoObra > 0) {
    const descSolucao = document.getElementById('os-solucao')?.value || 'Serviço de Assistência Técnica';
    itens.push({
      codigo: 'SERV',
      descricao: `MÃO DE OBRA / SERVIÇO: ${descSolucao}`,
      qtd: 1,
      un: 'SV',
      valorUnitario: valMaoObra,
      total: valMaoObra
    });
  }

  const dadosOS = {
    numeroDoc: document.getElementById('os-id')?.value || '0001',
    dataDoc: document.getElementById('os-data')?.value || new Date().toLocaleDateString('pt-BR'),
    statusDoc: document.getElementById('os-status')?.value || 'Aberto',
    observacao: `Aparelho: ${document.getElementById('os-aparelho')?.value || 'N/I'} | Defeito: ${document.getElementById('os-problema')?.value || 'N/I'}`,
    clienteNome: nomeCliente,
    itens: itens,
    valorTotal: parseFloat(document.getElementById('lbl-os-val-total')?.innerText) || 0,
    dataHoraImpressao: new Date().toLocaleString('pt-BR')
  };

  localStorage.setItem('dadosImpressaoPDF', JSON.stringify(dadosOS));
  window.open('impressao.html', '_blank');
}

function gerarPDFOrcamento() {
  const selectCliente = document.getElementById('orc-cliente');
  const nomeCliente = selectCliente ? selectCliente.options[selectCliente.selectedIndex]?.text : 'AO CONSUMIDOR';
  const itens = [];
  const linhasPecas = document.querySelectorAll('#container-pecas-orc .peca-row');

  linhasPecas.forEach((linha, index) => {
    const selectPeca = linha.querySelector('select');
    const inputQtd = linha.querySelector('input[type="number"]');
    const descPeca = selectPeca ? selectPeca.options[selectPeca.selectedIndex]?.text || 'Peça / Componente' : 'Peça';
    const qtd = inputQtd ? parseFloat(inputQtd.value) || 1 : 1;
    let valorUnitario = 0;
    if (selectPeca && selectPeca.options[selectPeca.selectedIndex]) {
      valorUnitario = parseFloat(selectPeca.options[selectPeca.selectedIndex].getAttribute('data-preco')) || 0;
    }
    itens.push({
      codigo: String(index + 1).padStart(4, '0'),
      descricao: descPeca,
      qtd: qtd,
      un: 'UN',
      valorUnitario: valorUnitario,
      total: qtd * valorUnitario
    });
  });

  const valMaoObra = parseFloat(document.getElementById('orc-mao-obra')?.value) || 0;
  if (valMaoObra > 0) {
    itens.push({
      codigo: 'SERV',
      descricao: `MÃO DE OBRA / SERVIÇO: ${document.getElementById('orc-solucao')?.value || 'Mão de Obra'}`,
      qtd: 1,
      un: 'SV',
      valorUnitario: valMaoObra,
      total: valMaoObra
    });
  }

  const dadosOrcamento = {
    numeroDoc: document.getElementById('orc-id')?.value || '0001',
    dataDoc: document.getElementById('orc-data')?.value || new Date().toLocaleDateString('pt-BR'),
    statusDoc: 'ORÇAMENTO',
    observacao: `Aparelho: ${document.getElementById('orc-aparelho')?.value || 'N/I'} | Defeito: ${document.getElementById('orc-problema')?.value || 'N/I'}`,
    clienteNome: nomeCliente,
    itens: itens,
    valorTotal: parseFloat(document.getElementById('lbl-orc-val-total')?.innerText) || 0,
    dataHoraImpressao: new Date().toLocaleString('pt-BR')
  };

  localStorage.setItem('dadosImpressaoPDF', JSON.stringify(dadosOrcamento));
  window.open('impressao.html', '_blank');
}

function gerarPDFVenda() {
  const selectCliente = document.getElementById('venda-cliente');
  const nomeCliente = selectCliente ? selectCliente.options[selectCliente.selectedIndex]?.text : 'AO CONSUMIDOR';
  const itens = [];
  const linhasPecas = document.querySelectorAll('#container-pecas-venda .peca-row');

  linhasPecas.forEach((linha, index) => {
    const selectPeca = linha.querySelector('select');
    const inputQtd = linha.querySelector('input[type="number"]');
    const descPeca = selectPeca ? selectPeca.options[selectPeca.selectedIndex]?.text || 'Item Vendido' : 'Item';
    const qtd = inputQtd ? parseFloat(inputQtd.value) || 1 : 1;
    let valorUnitario = 0;
    if (selectPeca && selectPeca.options[selectPeca.selectedIndex]) {
      valorUnitario = parseFloat(selectPeca.options[selectPeca.selectedIndex].getAttribute('data-preco')) || 0;
    }
    itens.push({
      codigo: String(index + 1).padStart(4, '0'),
      descricao: descPeca,
      qtd: qtd,
      un: 'UN',
      valorUnitario: valorUnitario,
      total: qtd * valorUnitario
    });
  });

  const dadosVenda = {
    numeroDoc: document.getElementById('venda-id')?.value || '0001',
    dataDoc: document.getElementById('venda-data')?.value || new Date().toLocaleDateString('pt-BR'),
    statusDoc: 'CONCLUÍDO',
    observacao: `Tipo Venda: ${document.getElementById('venda-tipo')?.value || 'Venda Direta'}`,
    clienteNome: nomeCliente,
    itens: itens,
    valorTotal: parseFloat(document.getElementById('lbl-venda-val-total')?.innerText) || 0,
    dataHoraImpressao: new Date().toLocaleString('pt-BR')
  };

  localStorage.setItem('dadosImpressaoPDF', JSON.stringify(dadosVenda));
  window.open('impressao.html', '_blank');
}