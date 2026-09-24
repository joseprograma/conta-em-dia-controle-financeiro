const LEGACY_STORAGE_KEY = "conta_em_dia_lancamentos";
const LEGACY_SESSION_KEY = "conta_em_dia_sessao";
const CONTAS_STORAGE_KEY = "conta_em_dia_contas";
const TENTATIVAS_STORAGE_KEY = "conta_em_dia_tentativas";
const SESSION_STORAGE_KEY = "conta_em_dia_sessao_ativa";
const PBKDF2_ITERACOES = 310000;
const SENHA_MINIMA = 8;
const MAX_TENTATIVAS = 5;
const BLOQUEIO_MS = 60 * 1000;
const INATIVIDADE_MS = 15 * 60 * 1000;
const BACKUP_TAMANHO_MAXIMO = 5 * 1024 * 1024;
const BACKUP_MAXIMO_LANCAMENTOS = 5000;
const DESCRICAO_MAXIMA = 200;
const OBSERVACAO_MAXIMA = 500;

const gruposReceita = [
  "Salário",
  "Diária",
  "Venda",
  "Pix recebido",
  "Benefício",
  "Ajuda familiar",
  "Serviço prestado",
  "Outros ganhos"
];

const gruposDespesa = [
  "Energia",
  "Água",
  "Internet",
  "Telefone",
  "TV",
  "Alimentação",
  "Mercado",
  "Transporte",
  "Remédio",
  "Aluguel",
  "Cartão de crédito",
  "Dívida",
  "Empréstimo",
  "Compra pessoal",
  "Educação",
  "Lazer",
  "Outros gastos"
];

// Nomes gravados pelas versoes anteriores, sem acento.
const GRUPOS_ANTIGOS = {
  Salario: "Salário",
  Diaria: "Diária",
  Beneficio: "Benefício",
  "Servico prestado": "Serviço prestado",
  Agua: "Água",
  Alimentacao: "Alimentação",
  Remedio: "Remédio",
  "Cartao de credito": "Cartão de crédito",
  Divida: "Dívida",
  Educacao: "Educação"
};

let lancamentos = [];
let mesAtual = new Date().getMonth() + 1;
let anoAtual = new Date().getFullYear();
let sessao = null;
let filaSalvamento = Promise.resolve();
let ultimaAtividade = Date.now();

const authShell = document.getElementById("authShell");
const appShell = document.getElementById("appShell");
const formEntrar = document.getElementById("formEntrar");
const formCadastrar = document.getElementById("formCadastrar");
const tabEntrar = document.getElementById("tabEntrar");
const tabCadastrar = document.getElementById("tabCadastrar");
const mesFiltro = document.getElementById("mesFiltro");
const anoFiltro = document.getElementById("anoFiltro");
const formLancamento = document.getElementById("formLancamento");
const arquivoBackup = document.getElementById("arquivoBackup");

async function iniciarSistema() {
  configurarAutenticacao();
  preencherMeses();
  anoFiltro.value = anoAtual;
  controlarCamposPorTipo();
  definirDataHoje();

  if (formLancamento) {
    formLancamento.addEventListener("submit", salvarLancamento);
  }

  configurarBotoes();
  configurarSaidaPorInatividade();

  if (!criptografiaDisponivel()) {
    trocarAbaAuth("entrar");
    definirMensagemAuth("mensagemEntrar", "Este navegador não suporta a proteção do sistema. Abra pelo Chrome, Edge ou Firefox atualizado, em endereço https.");
    return;
  }

  await restaurarSessao();
  aplicarEstadoAutenticacao();
}

function configurarBotoes() {
  const acoes = {
    tabEntrar: () => trocarAbaAuth("entrar"),
    tabCadastrar: () => trocarAbaAuth("cadastrar"),
    btnSair: sairDoSistema,
    btnAtualizar: atualizarPeriodo,
    btnLimpar: limparFormulario,
    btnExportarCsv: exportarCSV,
    btnBaixarBackup: baixarBackup,
    btnRestaurarBackup: () => arquivoBackup.click(),
    btnApagarTudo: apagarTudo
  };

  Object.entries(acoes).forEach(([id, acao]) => {
    document.getElementById(id).addEventListener("click", acao);
  });

  document.getElementById("tipo").addEventListener("change", controlarCamposPorTipo);
  arquivoBackup.addEventListener("change", importarBackup);

  // Um listener por tabela: os botoes gerados so carregam data-acao e data-id.
  ["tabelaReceitas", "tabelaDespesas"].forEach((id) => {
    document.getElementById(id).addEventListener("click", (event) => {
      const botao = event.target.closest("button[data-acao]");
      if (!botao) return;

      if (botao.dataset.acao === "editar") editarLancamento(botao.dataset.id);
      if (botao.dataset.acao === "excluir") excluirLancamento(botao.dataset.id);
    });
  });
}

function configurarSaidaPorInatividade() {
  const registrarAtividade = () => { ultimaAtividade = Date.now(); };

  ["mousemove", "mousedown", "keydown", "wheel", "scroll", "touchstart"].forEach((evento) => {
    document.addEventListener(evento, registrarAtividade, { passive: true });
  });

  // Checagem por horario (e nao um setTimeout unico) funciona mesmo apos o aparelho dormir.
  const verificar = () => {
    if (sessao && Date.now() - ultimaAtividade >= INATIVIDADE_MS) {
      sairDoSistema();
      definirMensagemAuth("mensagemEntrar", "Sessão encerrada após 15 minutos sem uso.", "info");
    }
  };

  setInterval(verificar, 30 * 1000);
  document.addEventListener("visibilitychange", verificar);
}

function atualizarNomesAntigos(lista) {
  if (!Array.isArray(lista)) return lista;

  return lista.map((item) => {
    if (!item || typeof item !== "object") return item;

    const atualizado = { ...item };
    if (Object.hasOwn(GRUPOS_ANTIGOS, item.grupo)) atualizado.grupo = GRUPOS_ANTIGOS[item.grupo];
    if (item.classificacao === "Variavel") atualizado.classificacao = "Variável";
    return atualizado;
  });
}

/* ---------- Criptografia ---------- */

function criptografiaDisponivel() {
  return Boolean(window.crypto && window.crypto.subtle);
}

function paraBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let texto = "";
  bytes.forEach((byte) => { texto += String.fromCharCode(byte); });
  return btoa(texto);
}

function deBase64(base64) {
  const texto = atob(base64);
  const bytes = new Uint8Array(texto.length);
  for (let i = 0; i < texto.length; i += 1) {
    bytes[i] = texto.charCodeAt(i);
  }
  return bytes;
}

function bytesAleatorios(tamanho) {
  return crypto.getRandomValues(new Uint8Array(tamanho));
}

async function gerarIdConta(email) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email));
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function derivarChave(senha, salt, iteracoes) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(senha),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: iteracoes, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

async function cifrar(chave, dados) {
  const iv = bytesAleatorios(12);
  const conteudo = new TextEncoder().encode(JSON.stringify(dados));
  const cifrado = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, chave, conteudo);
  return { iv: paraBase64(iv), dados: paraBase64(cifrado) };
}

async function decifrar(chave, pacote) {
  const aberto = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: deBase64(pacote.iv) },
    chave,
    deBase64(pacote.dados)
  );
  return JSON.parse(new TextDecoder().decode(aberto));
}

/* ---------- Contas locais ---------- */

function lerJson(chave) {
  try {
    return JSON.parse(localStorage.getItem(chave)) || {};
  } catch (erro) {
    return {};
  }
}

function lerContas() {
  return lerJson(CONTAS_STORAGE_KEY);
}

function gravarContas(contas) {
  localStorage.setItem(CONTAS_STORAGE_KEY, JSON.stringify(contas));
}

function segundosDeBloqueio(idConta) {
  const registro = lerJson(TENTATIVAS_STORAGE_KEY)[idConta];
  if (!registro || !registro.bloqueadoAte) return 0;
  return Math.max(0, Math.ceil((registro.bloqueadoAte - Date.now()) / 1000));
}

function registrarFalha(idConta) {
  const tentativas = lerJson(TENTATIVAS_STORAGE_KEY);
  const registro = tentativas[idConta] || { falhas: 0 };
  registro.falhas += 1;

  if (registro.falhas >= MAX_TENTATIVAS) {
    registro.falhas = 0;
    registro.bloqueadoAte = Date.now() + BLOQUEIO_MS;
  }

  tentativas[idConta] = registro;
  localStorage.setItem(TENTATIVAS_STORAGE_KEY, JSON.stringify(tentativas));
}

function limparFalhas(idConta) {
  const tentativas = lerJson(TENTATIVAS_STORAGE_KEY);
  delete tentativas[idConta];
  localStorage.setItem(TENTATIVAS_STORAGE_KEY, JSON.stringify(tentativas));
}

async function iniciarSessao(idConta, email, chave) {
  sessao = { idConta, email, chave };
  ultimaAtividade = Date.now();
  const chaveBruta = await crypto.subtle.exportKey("raw", chave);
  // sessionStorage some quando a aba e fechada: o login nao fica aberto no aparelho.
  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
    idConta,
    email,
    chave: paraBase64(chaveBruta)
  }));
}

async function restaurarSessao() {
  localStorage.removeItem(LEGACY_SESSION_KEY);

  try {
    const salvo = JSON.parse(sessionStorage.getItem(SESSION_STORAGE_KEY));
    if (!salvo) return;

    const conta = lerContas()[salvo.idConta];
    if (!conta) throw new Error("Conta inexistente");

    const chave = await crypto.subtle.importKey(
      "raw",
      deBase64(salvo.chave),
      { name: "AES-GCM" },
      true,
      ["encrypt", "decrypt"]
    );

    lancamentos = atualizarNomesAntigos(await decifrar(chave, conta.cofre));
    sessao = { idConta: salvo.idConta, email: salvo.email, chave };
  } catch (erro) {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    sessao = null;
    lancamentos = [];
  }
}

/* ---------- Tela de acesso ---------- */

function configurarAutenticacao() {
  if (formEntrar) {
    formEntrar.addEventListener("submit", entrarNoSistema);
  }

  if (formCadastrar) {
    formCadastrar.addEventListener("submit", criarAcesso);
  }
}

function trocarAbaAuth(aba) {
  const entrarAtivo = aba === "entrar";

  formEntrar.classList.toggle("auth-hidden", !entrarAtivo);
  formCadastrar.classList.toggle("auth-hidden", entrarAtivo);
  tabEntrar.classList.toggle("active", entrarAtivo);
  tabCadastrar.classList.toggle("active", !entrarAtivo);

  limparMensagensAuth();
}

function aplicarEstadoAutenticacao() {
  if (sessao) {
    authShell.classList.add("auth-hidden");
    appShell.classList.remove("app-hidden");
    document.getElementById("usuarioLogado").textContent = sessao.email;
    renderizarTudo();
    return;
  }

  authShell.classList.remove("auth-hidden");
  appShell.classList.add("app-hidden");

  const existeConta = Object.keys(lerContas()).length > 0;
  trocarAbaAuth(existeConta ? "entrar" : "cadastrar");

  if (!existeConta) {
    definirMensagemAuth("mensagemCadastro", "Primeiro acesso neste aparelho: crie seu e-mail e senha.", "info");
  }
}

function normalizarLogin(login) {
  return String(login || "").trim().toLowerCase();
}

function emailEhValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizarLogin(email));
}

function problemaNaSenha(senha) {
  const texto = String(senha || "");
  if (texto.length < SENHA_MINIMA) return `A senha precisa ter no mínimo ${SENHA_MINIMA} caracteres.`;
  if (!/[a-zA-Z]/.test(texto) || !/\d/.test(texto)) return "A senha precisa ter letras e números.";
  return "";
}

function definirMensagemAuth(id, mensagem, tipo) {
  const elemento = document.getElementById(id);
  if (elemento) {
    elemento.textContent = mensagem;
    elemento.classList.toggle("info", tipo === "info");
  }
}

function limparMensagensAuth() {
  definirMensagemAuth("mensagemEntrar", "");
  definirMensagemAuth("mensagemCadastro", "");
}

function travarFormulario(form, travado) {
  form.querySelectorAll("button, input").forEach((campo) => {
    campo.disabled = travado;
  });
}

async function criarAcesso(event) {
  event.preventDefault();

  const email = normalizarLogin(document.getElementById("loginCadastro").value);
  const senha = document.getElementById("senhaCadastro").value;
  const confirmacao = document.getElementById("senhaCadastroConfirmacao").value;

  if (!emailEhValido(email)) {
    definirMensagemAuth("mensagemCadastro", "Digite um e-mail válido.");
    return;
  }

  const erroSenha = problemaNaSenha(senha);
  if (erroSenha) {
    definirMensagemAuth("mensagemCadastro", erroSenha);
    return;
  }

  if (senha !== confirmacao) {
    definirMensagemAuth("mensagemCadastro", "As senhas não conferem.");
    return;
  }

  const idConta = await gerarIdConta(email);
  const contas = lerContas();

  if (contas[idConta]) {
    definirMensagemAuth("mensagemCadastro", "Este e-mail já tem acesso neste aparelho. Use a aba Entrar.");
    return;
  }

  travarFormulario(formCadastrar, true);
  definirMensagemAuth("mensagemCadastro", "Protegendo seu acesso...", "info");

  try {
    const salt = bytesAleatorios(16);
    const chave = await derivarChave(senha, salt, PBKDF2_ITERACOES);
    const dadosIniciais = importarDadosAntigos(contas);

    contas[idConta] = {
      salt: paraBase64(salt),
      iteracoes: PBKDF2_ITERACOES,
      criadoEm: new Date().toISOString(),
      cofre: await cifrar(chave, dadosIniciais)
    };
    gravarContas(contas);
    localStorage.removeItem(LEGACY_STORAGE_KEY);

    lancamentos = dadosIniciais;
    await iniciarSessao(idConta, email, chave);
    formCadastrar.reset();
    aplicarEstadoAutenticacao();
  } catch (erro) {
    definirMensagemAuth("mensagemCadastro", "Não foi possível criar o acesso. Tente novamente.");
  } finally {
    travarFormulario(formCadastrar, false);
  }
}

function importarDadosAntigos(contas) {
  // Lancamentos da versao antiga (sem criptografia) vao para a primeira conta criada.
  if (Object.keys(contas).length > 0) return [];

  try {
    const antigos = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY));
    return Array.isArray(antigos) ? atualizarNomesAntigos(antigos) : [];
  } catch (erro) {
    return [];
  }
}

async function entrarNoSistema(event) {
  event.preventDefault();

  const email = normalizarLogin(document.getElementById("loginEntrar").value);
  const senha = document.getElementById("senhaEntrar").value;

  if (!emailEhValido(email) || !senha) {
    definirMensagemAuth("mensagemEntrar", "Digite seu e-mail e sua senha.");
    return;
  }

  const idConta = await gerarIdConta(email);
  const bloqueio = segundosDeBloqueio(idConta);

  if (bloqueio > 0) {
    definirMensagemAuth("mensagemEntrar", `Muitas tentativas. Aguarde ${bloqueio} segundos.`);
    return;
  }

  travarFormulario(formEntrar, true);
  definirMensagemAuth("mensagemEntrar", "Verificando...", "info");

  try {
    const conta = lerContas()[idConta];
    if (!conta) throw new Error("Conta inexistente");

    const chave = await derivarChave(senha, deBase64(conta.salt), conta.iteracoes);
    lancamentos = atualizarNomesAntigos(await decifrar(chave, conta.cofre));

    limparFalhas(idConta);
    await iniciarSessao(idConta, email, chave);
    formEntrar.reset();
    aplicarEstadoAutenticacao();
  } catch (erro) {
    registrarFalha(idConta);
    definirMensagemAuth("mensagemEntrar", "E-mail ou senha inválidos.");
  } finally {
    travarFormulario(formEntrar, false);
  }
}

function sairDoSistema() {
  if (document.getElementById("dialogSenhaBackup").open) {
    document.getElementById("btnCancelarBackup").click();
  }

  sessionStorage.removeItem(SESSION_STORAGE_KEY);
  sessao = null;
  lancamentos = [];
  limparFormulario();
  // Redesenha tabelas, totais e resumos vazios para nao sobrar dado na tela.
  renderizarTudo();
  document.getElementById("usuarioLogado").textContent = "";
  aplicarEstadoAutenticacao();
}

function preencherMeses() {
  const meses = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];

  mesFiltro.innerHTML = meses
    .map((mes, index) => {
      const valor = index + 1;
      const selecionado = valor === mesAtual ? "selected" : "";
      return `<option value="${valor}" ${selecionado}>${mes}</option>`;
    })
    .join("");
}

function atualizarPeriodo() {
  mesAtual = Number(mesFiltro.value);
  anoAtual = Number(anoFiltro.value);
  renderizarTudo();
}

function definirDataHoje() {
  const hoje = new Date();
  const dataFormatada = hoje.toISOString().split("T")[0];
  document.getElementById("data").value = dataFormatada;
}

function salvarNoNavegador() {
  if (!sessao) return Promise.resolve();

  const { idConta, chave } = sessao;
  const copia = lancamentos.slice();

  // Fila garante que gravacoes seguidas terminem na ordem certa.
  filaSalvamento = filaSalvamento
    .then(async () => {
      const cofre = await cifrar(chave, copia);
      const contas = lerContas();
      if (!contas[idConta]) return;
      contas[idConta].cofre = cofre;
      gravarContas(contas);
    })
    .catch(() => {
      alert("Não foi possível salvar os dados neste aparelho. Verifique o espaço do navegador.");
    });

  return filaSalvamento;
}

function escaparHtml(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function gerarId() {
  return crypto.randomUUID().replace(/-/g, "");
}

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function formatarData(data) {
  if (!data) return "-";
  const partes = data.split("-");
  if (partes.length !== 3) return data;
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function valorNumero(id) {
  return Number(document.getElementById(id).value || 0);
}

function obterLancamentosDoPeriodo() {
  return obterLancamentosPorPeriodo(mesAtual, anoAtual);
}

function obterLancamentosPorPeriodo(mes, ano) {
  return lancamentos.filter((item) => {
    return Number(item.mes) === Number(mes) && Number(item.ano) === Number(ano);
  });
}

function obterResumoFinanceiro(lista) {
  const receitas = lista.filter((item) => item.tipo === "receita");
  const despesas = lista.filter((item) => item.tipo === "despesa");

  const receitaPrevista = somar(receitas, "previsto");
  const receitaRealizada = somar(receitas, "realizado");
  const despesaPrevista = somar(despesas, "previsto");
  const despesaRealizada = somar(despesas, "realizado");

  return {
    receitas,
    despesas,
    receitaPrevista,
    receitaRealizada,
    despesaPrevista,
    despesaRealizada,
    saldoPrevisto: receitaPrevista - despesaPrevista,
    saldoRealizado: receitaRealizada - despesaRealizada
  };
}

function obterMaiorGrupo(lista, tipo) {
  const itens = lista.filter((item) => item.tipo === tipo);
  if (itens.length === 0) return null;

  const totais = itens.reduce((acc, item) => {
    const chave = item.grupo || "Outros";
    acc[chave] = (acc[chave] || 0) + Number(item.realizado || 0);
    return acc;
  }, {});

  const [grupo, valor] = Object.entries(totais).sort((a, b) => b[1] - a[1])[0];
  return { grupo, valor };
}

function obterMesAnoAnterior(referencia) {
  const dataBase = new Date(referencia.getFullYear(), referencia.getMonth() - 1, 1);
  return {
    mes: dataBase.getMonth() + 1,
    ano: dataBase.getFullYear()
  };
}

function nomeMes(mes) {
  const meses = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"
  ];

  return meses[Number(mes) - 1] || "";
}

function controlarCamposPorTipo() {
  const tipo = document.getElementById("tipo").value;
  const grupo = document.getElementById("grupo");
  const classificacao = document.getElementById("classificacao");
  const lista = tipo === "receita" ? gruposReceita : gruposDespesa;

  grupo.innerHTML = `<option value="">Selecione</option>` + lista
    .map((item) => `<option value="${item}">${item}</option>`)
    .join("");

  if (tipo === "receita") {
    classificacao.value = "";
    classificacao.disabled = true;
  } else {
    classificacao.disabled = false;
    if (!classificacao.value) {
      classificacao.value = "Fixa";
    }
  }
}

function salvarLancamento(event) {
  event.preventDefault();

  const id = document.getElementById("lancamentoId").value;
  const tipo = document.getElementById("tipo").value;
  const grupo = document.getElementById("grupo").value;
  const descricao = document.getElementById("descricao").value.trim();
  const classificacao = document.getElementById("classificacao").value;
  const previsto = valorNumero("previsto");
  const realizado = valorNumero("realizado");
  const data = document.getElementById("data").value;
  const observacao = document.getElementById("observacao").value.trim();

  if (!grupo || !descricao || !data) {
    alert("Preencha grupo, descrição e data.");
    return;
  }

  const dataObj = new Date(`${data}T00:00:00`);
  const mes = dataObj.getMonth() + 1;
  const ano = dataObj.getFullYear();

  const novoLancamento = {
    id: id || gerarId(),
    tipo,
    grupo,
    descricao,
    classificacao: tipo === "despesa" ? classificacao || "Fixa" : "",
    previsto,
    realizado,
    diferenca: realizado - previsto,
    data,
    mes,
    ano,
    observacao
  };

  if (id) {
    lancamentos = lancamentos.map((item) => item.id === id ? novoLancamento : item);
  } else {
    lancamentos.push(novoLancamento);
  }

  salvarNoNavegador();
  limparFormulario();
  renderizarTudo();
}

function limparFormulario() {
  formLancamento.reset();
  document.getElementById("lancamentoId").value = "";
  document.getElementById("tipo").value = "receita";
  controlarCamposPorTipo();
  definirDataHoje();
}

function editarLancamento(id) {
  const item = lancamentos.find((lancamento) => lancamento.id === id);
  if (!item) return;

  document.getElementById("lancamentoId").value = item.id;
  document.getElementById("tipo").value = item.tipo;
  controlarCamposPorTipo();
  document.getElementById("grupo").value = item.grupo;
  document.getElementById("descricao").value = item.descricao;
  document.getElementById("classificacao").value = item.classificacao || "";
  document.getElementById("previsto").value = item.previsto;
  document.getElementById("realizado").value = item.realizado;
  document.getElementById("data").value = item.data;
  document.getElementById("observacao").value = item.observacao || "";

  window.location.href = "#lancamento";
}

function excluirLancamento(id) {
  const confirmar = confirm("Deseja realmente excluir este lançamento?");
  if (!confirmar) return;

  lancamentos = lancamentos.filter((item) => item.id !== id);
  salvarNoNavegador();
  renderizarTudo();
}

function renderizarTudo() {
  renderizarTabelas();
  renderizarTotais();
  renderizarAnaliseFinanceira();
  renderizarFechamentoMensal();
}

function renderizarTabelas() {
  const dadosPeriodo = obterLancamentosDoPeriodo();
  const receitas = dadosPeriodo.filter((item) => item.tipo === "receita");
  const despesas = dadosPeriodo.filter((item) => item.tipo === "despesa");

  renderizarReceitas(receitas);
  renderizarDespesas(despesas);
}

function renderizarReceitas(receitas) {
  const tabela = document.getElementById("tabelaReceitas");

  if (receitas.length === 0) {
    tabela.innerHTML = `
      <tr>
        <td colspan="7" class="empty">Nenhum ganho cadastrado neste mês.</td>
      </tr>
    `;
    return;
  }

  tabela.innerHTML = receitas
    .sort((a, b) => a.data.localeCompare(b.data))
    .map((item) => {
      const diferenca = item.realizado - item.previsto;
      const classe = diferenca >= 0 ? "valor-positivo" : "valor-negativo";

      return `
        <tr>
          <td>${escaparHtml(item.grupo)}</td>
          <td>
            <strong>${escaparHtml(item.descricao)}</strong>
            ${item.observacao ? `<br><small>${escaparHtml(item.observacao)}</small>` : ""}
          </td>
          <td>${formatarMoeda(item.previsto)}</td>
          <td>${formatarMoeda(item.realizado)}</td>
          <td class="${classe}">${formatarMoeda(diferenca)}</td>
          <td>${formatarData(item.data)}</td>
          <td>
            <button type="button" class="btn btn-secondary btn-small" data-acao="editar" data-id="${escaparHtml(item.id)}">Editar</button>
            <button type="button" class="btn btn-danger btn-small" data-acao="excluir" data-id="${escaparHtml(item.id)}">Excluir</button>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderizarDespesas(despesas) {
  const tabela = document.getElementById("tabelaDespesas");

  if (despesas.length === 0) {
    tabela.innerHTML = `
      <tr>
        <td colspan="8" class="empty">Nenhum gasto cadastrado neste mês.</td>
      </tr>
    `;
    return;
  }

  tabela.innerHTML = despesas
    .sort((a, b) => a.data.localeCompare(b.data))
    .map((item) => {
      const diferenca = item.previsto - item.realizado;
      const classe = diferenca >= 0 ? "valor-positivo" : "valor-negativo";
      const badgeClasse = item.classificacao === "Fixa" ? "fixa" : "variavel";

      return `
        <tr>
          <td>${escaparHtml(item.grupo)}</td>
          <td>
            <strong>${escaparHtml(item.descricao)}</strong>
            ${item.observacao ? `<br><small>${escaparHtml(item.observacao)}</small>` : ""}
          </td>
          <td><span class="badge ${badgeClasse}">${escaparHtml(item.classificacao)}</span></td>
          <td>${formatarMoeda(item.previsto)}</td>
          <td>${formatarMoeda(item.realizado)}</td>
          <td class="${classe}">${formatarMoeda(diferenca)}</td>
          <td>${formatarData(item.data)}</td>
          <td>
            <button type="button" class="btn btn-secondary btn-small" data-acao="editar" data-id="${escaparHtml(item.id)}">Editar</button>
            <button type="button" class="btn btn-danger btn-small" data-acao="excluir" data-id="${escaparHtml(item.id)}">Excluir</button>
          </td>
        </tr>
      `;
    })
    .join("");
}

function somar(lista, campo) {
  return lista.reduce((total, item) => total + Number(item[campo] || 0), 0);
}

function renderizarTotais() {
  const dadosPeriodo = obterLancamentosDoPeriodo();
  const resumo = obterResumoFinanceiro(dadosPeriodo);
  const {
    receitaPrevista,
    receitaRealizada,
    despesaPrevista,
    despesaRealizada,
    saldoPrevisto,
    saldoRealizado
  } = resumo;

  const diferencaGeral = saldoRealizado - saldoPrevisto;

  document.getElementById("totalReceitaPrevista").textContent = formatarMoeda(receitaPrevista);
  document.getElementById("totalReceitaRealizada").textContent = formatarMoeda(receitaRealizada);
  document.getElementById("totalDespesaPrevista").textContent = formatarMoeda(despesaPrevista);
  document.getElementById("totalDespesaRealizada").textContent = formatarMoeda(despesaRealizada);
  document.getElementById("saldoPrevisto").textContent = formatarMoeda(saldoPrevisto);
  document.getElementById("saldoRealizado").textContent = formatarMoeda(saldoRealizado);
  document.getElementById("diferencaGeral").textContent = formatarMoeda(diferencaGeral);
  document.getElementById("rodapeReceitaPrevista").textContent = formatarMoeda(receitaPrevista);
  document.getElementById("rodapeReceitaRealizada").textContent = formatarMoeda(receitaRealizada);
  document.getElementById("rodapeReceitaDiferenca").textContent = formatarMoeda(receitaRealizada - receitaPrevista);
  document.getElementById("rodapeDespesaPrevista").textContent = formatarMoeda(despesaPrevista);
  document.getElementById("rodapeDespesaRealizada").textContent = formatarMoeda(despesaRealizada);
  document.getElementById("rodapeDespesaDiferenca").textContent = formatarMoeda(despesaPrevista - despesaRealizada);

  aplicarCoresSaldo("saldoPrevisto", saldoPrevisto);
  aplicarCoresSaldo("saldoRealizado", saldoRealizado);
  aplicarCoresSaldo("diferencaGeral", diferencaGeral);
}

function renderizarAnaliseFinanceira() {
  const dadosPeriodo = obterLancamentosDoPeriodo();
  const resumo = obterResumoFinanceiro(dadosPeriodo);
  const statusResultado = document.getElementById("statusResultado");
  const tituloResultado = document.getElementById("tituloResultado");
  const detalheResultado = document.getElementById("detalheResultado");
  const mensagemResultado = document.getElementById("mensagemResultado");
  const listaSugestoes = document.getElementById("listaSugestoes");

  statusResultado.classList.remove("positivo", "negativo", "neutro");

  if (dadosPeriodo.length === 0) {
    mensagemResultado.textContent = "Cadastre os lançamentos do mês para comparar ganhos e despesas automaticamente.";
    tituloResultado.textContent = "Aguardando lançamentos";
    detalheResultado.textContent = "Assim que houver dados, o sistema vai dizer se sobrou ou faltou dinheiro no mês.";
    statusResultado.classList.add("neutro");
    listaSugestoes.innerHTML = `
      <div class="suggestion-item">
        <strong>Comece pelo básico</strong>
        <p>Cadastre primeiro seus ganhos fixos e depois as despesas essenciais para montar um plano real do mês.</p>
      </div>
    `;
    return;
  }

  const saldoRealizado = resumo.saldoRealizado;
  const diferenca = Math.abs(saldoRealizado);
  const maiorReceita = obterMaiorGrupo(dadosPeriodo, "receita");
  const maiorDespesa = obterMaiorGrupo(dadosPeriodo, "despesa");
  const sugestoes = gerarSugestoesPlanejamento(resumo, maiorReceita, maiorDespesa);

  if (saldoRealizado > 0) {
    mensagemResultado.textContent = "Os ganhos ficaram maiores que as despesas neste período.";
    tituloResultado.textContent = `Sobrou ${formatarMoeda(saldoRealizado)} no fim do mês`;
    detalheResultado.textContent = "Seu resultado foi positivo. Vale separar parte dessa sobra para reserva e contas futuras.";
    statusResultado.classList.add("positivo");
  } else if (saldoRealizado < 0) {
    mensagemResultado.textContent = "As despesas ficaram maiores que os ganhos neste período.";
    tituloResultado.textContent = `Faltaram ${formatarMoeda(diferenca)} para fechar o mês`;
    detalheResultado.textContent = "Você fechou no vermelho. O ideal é cortar ou renegociar os maiores gastos e priorizar despesas essenciais.";
    statusResultado.classList.add("negativo");
  } else {
    mensagemResultado.textContent = "Os ganhos ficaram iguais às despesas neste período.";
    tituloResultado.textContent = "Mês empatado";
    detalheResultado.textContent = "Não faltou dinheiro, mas também não sobrou. Um pequeno corte em gastos variáveis já cria folga.";
    statusResultado.classList.add("neutro");
  }

  listaSugestoes.innerHTML = sugestoes
    .map((sugestao) => `
      <div class="suggestion-item">
        <strong>${escaparHtml(sugestao.titulo)}</strong>
        <p>${escaparHtml(sugestao.texto)}</p>
      </div>
    `)
    .join("");
}

function gerarSugestoesPlanejamento(resumo, maiorReceita, maiorDespesa) {
  const sugestoes = [];
  const diferencaPrevistoRealizado = resumo.despesaRealizada - resumo.despesaPrevista;
  const despesasVariaveis = resumo.despesas.filter((item) => item.classificacao === "Variável" || item.classificacao === "Variavel");
  const totalVariavel = somar(despesasVariaveis, "realizado");

  if (maiorDespesa) {
    sugestoes.push({
      titulo: `Olhe primeiro para ${maiorDespesa.grupo}`,
      texto: `${maiorDespesa.grupo} foi seu maior gasto realizado, somando ${formatarMoeda(maiorDespesa.valor)}. Veja se dá para reduzir, parcelar melhor ou trocar por uma opção mais barata.`
    });
  }

  if (diferencaPrevistoRealizado > 0) {
    sugestoes.push({
      titulo: "Seus gastos passaram do planejado",
      texto: `Você gastou ${formatarMoeda(diferencaPrevistoRealizado)} acima do previsto. No próximo mês, aumente a previsão das contas que sempre passam do valor ou corte excessos antes da última semana.`
    });
  }

  if (totalVariavel > 0) {
    sugestoes.push({
      titulo: "Controle mais os gastos variáveis",
      texto: `As despesas variáveis somaram ${formatarMoeda(totalVariavel)}. Definir um limite semanal para mercado, lazer e compras pessoais ajuda a não terminar no vermelho.`
    });
  }

  if (maiorReceita) {
    sugestoes.push({
      titulo: `Proteja sua principal entrada: ${maiorReceita.grupo}`,
      texto: `${maiorReceita.grupo} foi a maior fonte de ganho, com ${formatarMoeda(maiorReceita.valor)}. Planeje as contas fixas usando essa base e trate ganhos extras como reforço, não como obrigação.`
    });
  }

  if (resumo.saldoRealizado <= 0) {
    sugestoes.push({
      titulo: "Monte uma sobra obrigatória",
      texto: "Assim que receber, separe primeiro um valor pequeno para reserva e só depois distribua o restante nas despesas. Isso evita que todo o dinheiro suma antes do fim do mês."
    });
  } else {
    sugestoes.push({
      titulo: "Transforme a sobra em segurança",
      texto: `Como sobrou ${formatarMoeda(resumo.saldoRealizado)}, vale guardar uma parte para contas inesperadas e outra para despesas anuais, como material escolar, remédios ou manutenção.`
    });
  }

  return sugestoes.slice(0, 4);
}

function renderizarFechamentoMensal() {
  const resumoMensal = document.getElementById("resumoMensalAutomatico");
  const hoje = new Date();

  if (hoje.getDate() !== 1) {
    resumoMensal.innerHTML = `
      <div class="summary-item">
        <strong>Fechamento disponível no dia 1</strong>
        <p>Abra o sistema no primeiro dia do mês para ver automaticamente o resumo do mês anterior, com a maior fonte de ganho e o maior foco de gastos.</p>
      </div>
    `;
    return;
  }

  const periodoAnterior = obterMesAnoAnterior(hoje);
  const dadosPeriodoAnterior = obterLancamentosPorPeriodo(periodoAnterior.mes, periodoAnterior.ano);

  if (dadosPeriodoAnterior.length === 0) {
    resumoMensal.innerHTML = `
      <div class="summary-item">
        <strong>Sem dados do mês anterior</strong>
        <p>Não há lançamentos em ${nomeMes(periodoAnterior.mes)} de ${periodoAnterior.ano} para gerar o fechamento automático.</p>
      </div>
    `;
    return;
  }

  const resumo = obterResumoFinanceiro(dadosPeriodoAnterior);
  const maiorReceita = obterMaiorGrupo(dadosPeriodoAnterior, "receita");
  const maiorDespesa = obterMaiorGrupo(dadosPeriodoAnterior, "despesa");
  const saldoTexto = resumo.saldoRealizado >= 0
    ? `Sobrou ${formatarMoeda(resumo.saldoRealizado)} no fechamento.`
    : `Faltaram ${formatarMoeda(Math.abs(resumo.saldoRealizado))} no fechamento.`;

  resumoMensal.innerHTML = `
    <div class="summary-item">
      <strong>Fechamento de ${nomeMes(periodoAnterior.mes)} de ${periodoAnterior.ano}</strong>
      <p>${saldoTexto}</p>
    </div>
    <div class="summary-item">
      <strong>Onde ganhou mais</strong>
      <p>${maiorReceita ? `${escaparHtml(maiorReceita.grupo)} trouxe ${formatarMoeda(maiorReceita.valor)}.` : "Não houve ganhos cadastrados no mês anterior."}</p>
    </div>
    <div class="summary-item">
      <strong>Onde gastou mais</strong>
      <p>${maiorDespesa ? `${escaparHtml(maiorDespesa.grupo)} consumiu ${formatarMoeda(maiorDespesa.valor)}.` : "Não houve gastos cadastrados no mês anterior."}</p>
    </div>
  `;
}

function aplicarCoresSaldo(id, valor) {
  const elemento = document.getElementById(id);
  elemento.classList.remove("valor-positivo", "valor-negativo");

  if (valor >= 0) {
    elemento.classList.add("valor-positivo");
  } else {
    elemento.classList.add("valor-negativo");
  }
}

function apagarTudo() {
  const confirmar = confirm("Tem certeza que deseja apagar todos os lançamentos?");
  if (!confirmar) return;

  lancamentos = [];
  salvarNoNavegador();
  renderizarTudo();
}

function exportarCSV() {
  const dadosPeriodo = obterLancamentosDoPeriodo();

  if (dadosPeriodo.length === 0) {
    alert("Não há dados para exportar neste mês.");
    return;
  }

  if (!confirm("O arquivo CSV não é protegido por senha. Guarde em local seguro. Deseja continuar?")) return;

  const cabecalho = [
    "Tipo",
    "Grupo",
    "Descrição",
    "Classificação",
    "Previsto",
    "Realizado",
    "Diferença",
    "Data",
    "Observação"
  ];

  const linhas = dadosPeriodo.map((item) => [
    item.tipo === "receita" ? "Receita" : "Despesa",
    item.grupo,
    item.descricao,
    item.classificacao,
    item.previsto,
    item.realizado,
    item.tipo === "despesa" ? item.previsto - item.realizado : item.realizado - item.previsto,
    item.data,
    item.observacao || ""
  ]);

  const conteudo = [cabecalho, ...linhas]
    .map((linha) => linha.map((campo) => `"${String(campo).replace(/"/g, '""')}"`).join(";"))
    .join("\n");

  // BOM para o Excel reconhecer os acentos em UTF-8.
  const blob = new Blob(["﻿" + conteudo], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `conta-em-dia-${mesAtual}-${anoAtual}.csv`;
  link.click();

  URL.revokeObjectURL(url);
}

/* ---------- Backup ---------- */

async function baixarBackup() {
  if (!sessao) return;

  if (lancamentos.length === 0) {
    alert("Não há lançamentos para salvar no backup.");
    return;
  }

  const conta = lerContas()[sessao.idConta];
  if (!conta) return;

  // Cifrado com a chave da sessao: so abre com a senha desta conta.
  const conteudo = JSON.stringify({
    sistema: "conta-em-dia",
    versao: 2,
    salt: conta.salt,
    iteracoes: conta.iteracoes,
    cofre: await cifrar(sessao.chave, lancamentos)
  });

  const blob = new Blob([conteudo], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const hoje = new Date().toISOString().split("T")[0];

  link.href = url;
  link.download = `conta-em-dia-backup-${hoje}.json`;
  link.click();

  URL.revokeObjectURL(url);
}

function dataEhReal(texto) {
  if (typeof texto !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const [ano, mes, dia] = texto.split("-").map(Number);
  const data = new Date(ano, mes - 1, dia);
  return data.getFullYear() === ano && data.getMonth() === mes - 1 && data.getDate() === dia;
}

function valorEhValido(valor) {
  return typeof valor === "number" && Number.isFinite(valor) && valor >= 0;
}

function textoEhValido(valor, maximo, obrigatorio) {
  if (valor === undefined || valor === null || valor === "") return !obrigatorio;
  return typeof valor === "string" && valor.length <= maximo;
}

function lancamentoEhValido(item) {
  if (!item || typeof item !== "object") return false;

  const grupos = item.tipo === "receita" ? gruposReceita : gruposDespesa;

  return typeof item.id === "string"
    && /^[a-z0-9]+$/i.test(item.id)
    && (item.tipo === "receita" || item.tipo === "despesa")
    && grupos.includes(item.grupo)
    && dataEhReal(item.data)
    && textoEhValido(item.descricao, DESCRICAO_MAXIMA, true)
    && textoEhValido(item.observacao, OBSERVACAO_MAXIMA, false)
    && valorEhValido(item.previsto)
    && valorEhValido(item.realizado);
}

function limparLancamentoImportado(item) {
  // Monta um objeto novo so com os campos conhecidos, descartando qualquer extra do arquivo.
  const [ano, mes] = item.data.split("-").map(Number);
  const classificacao = item.tipo === "despesa"
    ? (item.classificacao === "Variável" || item.classificacao === "Variavel" ? "Variável" : "Fixa")
    : "";

  return {
    id: item.id,
    tipo: item.tipo,
    grupo: item.grupo,
    descricao: item.descricao.trim(),
    classificacao,
    previsto: item.previsto,
    realizado: item.realizado,
    diferenca: item.realizado - item.previsto,
    data: item.data,
    mes,
    ano,
    observacao: (item.observacao || "").trim()
  };
}

function pacoteProtegidoEhValido(conteudo) {
  return typeof conteudo.salt === "string"
    && Number.isInteger(conteudo.iteracoes)
    && conteudo.iteracoes >= 100000
    && conteudo.iteracoes <= 2000000
    && conteudo.cofre
    && typeof conteudo.cofre.iv === "string"
    && typeof conteudo.cofre.dados === "string";
}

function pedirSenhaBackup(pacote) {
  const dialog = document.getElementById("dialogSenhaBackup");
  const form = document.getElementById("formSenhaBackup");
  const campo = document.getElementById("senhaBackup");
  const cancelar = document.getElementById("btnCancelarBackup");

  return new Promise((resolve) => {
    const encerrar = (resultado) => {
      form.removeEventListener("submit", enviar);
      cancelar.removeEventListener("click", aoCancelar);
      dialog.removeEventListener("cancel", aoCancelar);
      form.reset();
      definirMensagemAuth("mensagemBackup", "");
      if (dialog.open) dialog.close();
      resolve(resultado);
    };

    const aoCancelar = (event) => {
      event.preventDefault();
      encerrar(null);
    };

    const enviar = async (event) => {
      event.preventDefault();
      travarFormulario(form, true);
      definirMensagemAuth("mensagemBackup", "Abrindo backup...", "info");

      try {
        const chave = await derivarChave(campo.value, deBase64(pacote.salt), pacote.iteracoes);
        encerrar(await decifrar(chave, pacote.cofre));
      } catch (erro) {
        definirMensagemAuth("mensagemBackup", "Senha incorreta.");
        campo.select();
      } finally {
        travarFormulario(form, false);
      }
    };

    form.addEventListener("submit", enviar);
    cancelar.addEventListener("click", aoCancelar);
    dialog.addEventListener("cancel", aoCancelar);
    dialog.showModal();
    campo.focus();
  });
}

async function abrirBackupProtegido(conteudo) {
  // Backup da propria conta abre direto com a chave da sessao.
  try {
    return await decifrar(sessao.chave, conteudo.cofre);
  } catch (erro) {
    return pedirSenhaBackup(conteudo);
  }
}

function lerArquivoComoTexto(arquivo) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(leitor.result);
    leitor.onerror = () => reject(leitor.error);
    leitor.readAsText(arquivo);
  });
}

async function importarBackup(event) {
  const arquivo = event.target.files[0];
  event.target.value = "";
  if (!arquivo || !sessao) return;

  if (arquivo.size > BACKUP_TAMANHO_MAXIMO) {
    alert("Arquivo muito grande. O limite do backup é 5 MB.");
    return;
  }

  let recebidos;

  try {
    const conteudo = JSON.parse(await lerArquivoComoTexto(arquivo));

    if (Array.isArray(conteudo)) {
      recebidos = conteudo;
    } else if (conteudo && conteudo.sistema === "conta-em-dia" && conteudo.versao === 2) {
      if (!pacoteProtegidoEhValido(conteudo)) throw new Error("Formato invalido");
      recebidos = await abrirBackupProtegido(conteudo);
      if (recebidos === null) return;
    } else if (conteudo && Array.isArray(conteudo.lancamentos)) {
      recebidos = conteudo.lancamentos;
    }

    if (!Array.isArray(recebidos)) throw new Error("Formato invalido");
  } catch (erro) {
    if (!sessao) return;
    alert("Arquivo de backup inválido.");
    return;
  }

  if (!sessao) return;

  recebidos = atualizarNomesAntigos(recebidos);

  if (recebidos.length > BACKUP_MAXIMO_LANCAMENTOS) {
    alert(`O backup tem ${recebidos.length} lançamentos. O limite por arquivo é ${BACKUP_MAXIMO_LANCAMENTOS}.`);
    return;
  }

  const idsExistentes = new Set(lancamentos.map((item) => item.id));
  const novos = [];

  recebidos.forEach((item) => {
    if (!lancamentoEhValido(item) || idsExistentes.has(item.id)) return;
    idsExistentes.add(item.id);
    novos.push(limparLancamentoImportado(item));
  });

  const ignorados = recebidos.length - novos.length;

  if (novos.length === 0) {
    alert(`Nenhum lançamento importado. ${ignorados} ignorado(s) por serem inválidos ou repetidos.`);
    return;
  }

  if (!confirm(`Adicionar ${novos.length} lançamento(s) do backup?`)) return;

  lancamentos = lancamentos.concat(novos);
  salvarNoNavegador();
  renderizarTudo();
  alert(`${novos.length} lançamento(s) importado(s) e ${ignorados} ignorado(s).`);
}

document.addEventListener("DOMContentLoaded", iniciarSistema);
