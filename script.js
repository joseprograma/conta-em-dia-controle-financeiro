const LEGACY_STORAGE_KEY = "conta_em_dia_lancamentos";
const LEGACY_SESSION_KEY = "conta_em_dia_sessao";
const CONTAS_STORAGE_KEY = "conta_em_dia_contas";
const TENTATIVAS_STORAGE_KEY = "conta_em_dia_tentativas";
const SESSION_STORAGE_KEY = "conta_em_dia_sessao_ativa";
const PBKDF2_ITERACOES = 310000;
const SENHA_MINIMA = 8;
const MAX_TENTATIVAS = 5;
const BLOQUEIO_MS = 60 * 1000;

const gruposReceita = [
  "Salario",
  "Diaria",
  "Venda",
  "Pix recebido",
  "Beneficio",
  "Ajuda familiar",
  "Servico prestado",
  "Outros ganhos"
];

const gruposDespesa = [
  "Energia",
  "Agua",
  "Internet",
  "Telefone",
  "Alimentacao",
  "Mercado",
  "Transporte",
  "Remedio",
  "Aluguel",
  "Cartao de credito",
  "Divida",
  "Compra pessoal",
  "Educacao",
  "Lazer",
  "Outros gastos"
];

let lancamentos = [];
let mesAtual = new Date().getMonth() + 1;
let anoAtual = new Date().getFullYear();
let sessao = null;
let filaSalvamento = Promise.resolve();

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

  if (arquivoBackup) {
    arquivoBackup.addEventListener("change", importarBackup);
  }

  if (!criptografiaDisponivel()) {
    trocarAbaAuth("entrar");
    definirMensagemAuth("mensagemEntrar", "Este navegador nao suporta a protecao do sistema. Abra pelo Chrome, Edge ou Firefox atualizado, em endereco https.");
    return;
  }

  await restaurarSessao();
  aplicarEstadoAutenticacao();
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

    lancamentos = await decifrar(chave, conta.cofre);
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
  if (texto.length < SENHA_MINIMA) return `A senha precisa ter no minimo ${SENHA_MINIMA} caracteres.`;
  if (!/[a-zA-Z]/.test(texto) || !/\d/.test(texto)) return "A senha precisa ter letras e numeros.";
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
    definirMensagemAuth("mensagemCadastro", "Digite um e-mail valido.");
    return;
  }

  const erroSenha = problemaNaSenha(senha);
  if (erroSenha) {
    definirMensagemAuth("mensagemCadastro", erroSenha);
    return;
  }

  if (senha !== confirmacao) {
    definirMensagemAuth("mensagemCadastro", "As senhas nao conferem.");
    return;
  }

  const idConta = await gerarIdConta(email);
  const contas = lerContas();

  if (contas[idConta]) {
    definirMensagemAuth("mensagemCadastro", "Este e-mail ja tem acesso neste aparelho. Use a aba Entrar.");
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
    definirMensagemAuth("mensagemCadastro", "Nao foi possivel criar o acesso. Tente novamente.");
  } finally {
    travarFormulario(formCadastrar, false);
  }
}

function importarDadosAntigos(contas) {
  // Lancamentos da versao antiga (sem criptografia) vao para a primeira conta criada.
  if (Object.keys(contas).length > 0) return [];

  try {
    const antigos = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY));
    return Array.isArray(antigos) ? antigos : [];
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
    lancamentos = await decifrar(chave, conta.cofre);

    limparFalhas(idConta);
    await iniciarSessao(idConta, email, chave);
    formEntrar.reset();
    aplicarEstadoAutenticacao();
  } catch (erro) {
    registrarFalha(idConta);
    definirMensagemAuth("mensagemEntrar", "E-mail ou senha invalidos.");
  } finally {
    travarFormulario(formEntrar, false);
  }
}

function sairDoSistema() {
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
  sessao = null;
  lancamentos = [];
  limparFormulario();
  aplicarEstadoAutenticacao();
}

function preencherMeses() {
  const meses = [
    "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
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
      alert("Nao foi possivel salvar os dados neste aparelho. Verifique o espaco do navegador.");
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
  return Date.now().toString() + Math.random().toString(36).substring(2, 8);
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
    "janeiro", "fevereiro", "marco", "abril", "maio", "junho",
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
    alert("Preencha grupo, descricao e data.");
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
  const confirmar = confirm("Deseja realmente excluir este lancamento?");
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
        <td colspan="7" class="empty">Nenhum ganho cadastrado neste mes.</td>
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
            <button class="btn btn-secondary btn-small" onclick="editarLancamento('${escaparHtml(item.id)}')">Editar</button>
            <button class="btn btn-danger btn-small" onclick="excluirLancamento('${escaparHtml(item.id)}')">Excluir</button>
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
        <td colspan="8" class="empty">Nenhum gasto cadastrado neste mes.</td>
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
            <button class="btn btn-secondary btn-small" onclick="editarLancamento('${escaparHtml(item.id)}')">Editar</button>
            <button class="btn btn-danger btn-small" onclick="excluirLancamento('${escaparHtml(item.id)}')">Excluir</button>
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
    mensagemResultado.textContent = "Cadastre os lancamentos do mes para comparar ganhos e despesas automaticamente.";
    tituloResultado.textContent = "Aguardando lancamentos";
    detalheResultado.textContent = "Assim que houver dados, o sistema vai dizer se sobrou ou faltou dinheiro no mes.";
    statusResultado.classList.add("neutro");
    listaSugestoes.innerHTML = `
      <div class="suggestion-item">
        <strong>Comece pelo basico</strong>
        <p>Cadastre primeiro seus ganhos fixos e depois as despesas essenciais para montar um plano real do mes.</p>
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
    mensagemResultado.textContent = "Os ganhos ficaram maiores que as despesas neste periodo.";
    tituloResultado.textContent = `Sobrou ${formatarMoeda(saldoRealizado)} no fim do mes`;
    detalheResultado.textContent = "Seu resultado foi positivo. Vale separar parte dessa sobra para reserva e contas futuras.";
    statusResultado.classList.add("positivo");
  } else if (saldoRealizado < 0) {
    mensagemResultado.textContent = "As despesas ficaram maiores que os ganhos neste periodo.";
    tituloResultado.textContent = `Faltaram ${formatarMoeda(diferenca)} para fechar o mes`;
    detalheResultado.textContent = "Voce fechou no vermelho. O ideal e cortar ou renegociar os maiores gastos e priorizar despesas essenciais.";
    statusResultado.classList.add("negativo");
  } else {
    mensagemResultado.textContent = "Os ganhos ficaram iguais as despesas neste periodo.";
    tituloResultado.textContent = "Mes empatado";
    detalheResultado.textContent = "Nao faltou dinheiro, mas tambem nao sobrou. Um pequeno corte em gastos variaveis ja cria folga.";
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
      texto: `${maiorDespesa.grupo} foi seu maior gasto realizado, somando ${formatarMoeda(maiorDespesa.valor)}. Veja se da para reduzir, parcelar melhor ou trocar por uma opcao mais barata.`
    });
  }

  if (diferencaPrevistoRealizado > 0) {
    sugestoes.push({
      titulo: "Seus gastos passaram do planejado",
      texto: `Voce gastou ${formatarMoeda(diferencaPrevistoRealizado)} acima do previsto. No proximo mes, aumente a previsao das contas que sempre passam do valor ou corte excessos antes da ultima semana.`
    });
  }

  if (totalVariavel > 0) {
    sugestoes.push({
      titulo: "Controle mais os gastos variaveis",
      texto: `As despesas variaveis somaram ${formatarMoeda(totalVariavel)}. Definir um limite semanal para mercado, lazer e compras pessoais ajuda a nao terminar no vermelho.`
    });
  }

  if (maiorReceita) {
    sugestoes.push({
      titulo: `Proteja sua principal entrada: ${maiorReceita.grupo}`,
      texto: `${maiorReceita.grupo} foi a maior fonte de ganho, com ${formatarMoeda(maiorReceita.valor)}. Planeje as contas fixas usando essa base e trate ganhos extras como reforco, nao como obrigacao.`
    });
  }

  if (resumo.saldoRealizado <= 0) {
    sugestoes.push({
      titulo: "Monte uma sobra obrigatoria",
      texto: "Assim que receber, separe primeiro um valor pequeno para reserva e so depois distribua o restante nas despesas. Isso evita que todo o dinheiro suma antes do fim do mes."
    });
  } else {
    sugestoes.push({
      titulo: "Transforme a sobra em seguranca",
      texto: `Como sobrou ${formatarMoeda(resumo.saldoRealizado)}, vale guardar uma parte para contas inesperadas e outra para despesas anuais, como material escolar, remedios ou manutencao.`
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
        <strong>Fechamento disponivel no dia 1</strong>
        <p>Abra o sistema no primeiro dia do mes para ver automaticamente o resumo do mes anterior, com a maior fonte de ganho e o maior foco de gastos.</p>
      </div>
    `;
    return;
  }

  const periodoAnterior = obterMesAnoAnterior(hoje);
  const dadosPeriodoAnterior = obterLancamentosPorPeriodo(periodoAnterior.mes, periodoAnterior.ano);

  if (dadosPeriodoAnterior.length === 0) {
    resumoMensal.innerHTML = `
      <div class="summary-item">
        <strong>Sem dados do mes anterior</strong>
        <p>Nao ha lancamentos em ${nomeMes(periodoAnterior.mes)} de ${periodoAnterior.ano} para gerar o fechamento automatico.</p>
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
      <p>${maiorReceita ? `${escaparHtml(maiorReceita.grupo)} trouxe ${formatarMoeda(maiorReceita.valor)}.` : "Nao houve ganhos cadastrados no mes anterior."}</p>
    </div>
    <div class="summary-item">
      <strong>Onde gastou mais</strong>
      <p>${maiorDespesa ? `${escaparHtml(maiorDespesa.grupo)} consumiu ${formatarMoeda(maiorDespesa.valor)}.` : "Nao houve gastos cadastrados no mes anterior."}</p>
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
  const confirmar = confirm("Tem certeza que deseja apagar todos os lancamentos?");
  if (!confirmar) return;

  lancamentos = [];
  salvarNoNavegador();
  renderizarTudo();
}

function exportarCSV() {
  const dadosPeriodo = obterLancamentosDoPeriodo();

  if (dadosPeriodo.length === 0) {
    alert("Nao ha dados para exportar neste mes.");
    return;
  }

  const cabecalho = [
    "Tipo",
    "Grupo",
    "Descricao",
    "Classificacao",
    "Previsto",
    "Realizado",
    "Diferenca",
    "Data",
    "Observacao"
  ];

  const linhas = dadosPeriodo.map((item) => [
    item.tipo,
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

  const blob = new Blob([conteudo], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `conta-em-dia-${mesAtual}-${anoAtual}.csv`;
  link.click();

  URL.revokeObjectURL(url);
}

function baixarBackup() {
  if (lancamentos.length === 0) {
    alert("Nao ha lancamentos para salvar no backup.");
    return;
  }

  const conteudo = JSON.stringify({
    sistema: "conta-em-dia",
    versao: 1,
    geradoEm: new Date().toISOString(),
    lancamentos
  }, null, 2);

  const blob = new Blob([conteudo], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const hoje = new Date().toISOString().split("T")[0];

  link.href = url;
  link.download = `conta-em-dia-backup-${hoje}.json`;
  link.click();

  URL.revokeObjectURL(url);
}

function lancamentoEhValido(item) {
  return item
    && typeof item.id === "string"
    && (item.tipo === "receita" || item.tipo === "despesa")
    && /^\d{4}-\d{2}-\d{2}$/.test(String(item.data || ""));
}

function importarBackup(event) {
  const arquivo = event.target.files[0];
  event.target.value = "";
  if (!arquivo) return;

  const leitor = new FileReader();

  leitor.onload = () => {
    let recebidos;

    try {
      const conteudo = JSON.parse(leitor.result);
      recebidos = Array.isArray(conteudo) ? conteudo : conteudo.lancamentos;
      if (!Array.isArray(recebidos)) throw new Error("Formato invalido");
    } catch (erro) {
      alert("Arquivo de backup invalido.");
      return;
    }

    const validos = recebidos.filter(lancamentoEhValido);
    const idsExistentes = new Set(lancamentos.map((item) => item.id));
    const novos = validos
      .filter((item) => !idsExistentes.has(item.id))
      .map((item) => {
        const [ano, mes] = item.data.split("-").map(Number);
        return { ...item, previsto: Number(item.previsto) || 0, realizado: Number(item.realizado) || 0, mes, ano };
      });

    if (novos.length === 0) {
      alert("Nenhum lancamento novo encontrado no backup.");
      return;
    }

    if (!confirm(`Adicionar ${novos.length} lancamento(s) do backup?`)) return;

    lancamentos = lancamentos.concat(novos);
    salvarNoNavegador();
    renderizarTudo();
  };

  leitor.readAsText(arquivo);
}

document.addEventListener("DOMContentLoaded", iniciarSistema);
