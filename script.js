const STORAGE_KEY = "conta_em_dia_lancamentos";
const SESSION_STORAGE_KEY = "conta_em_dia_sessao";
const FIXED_LOGIN = "controlefinanceirosistema@gmail.com";
const FIXED_PASSWORD = "sistema1";

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

const authShell = document.getElementById("authShell");
const appShell = document.getElementById("appShell");
const formEntrar = document.getElementById("formEntrar");
const tabEntrar = document.getElementById("tabEntrar");
const tabCadastrar = document.getElementById("tabCadastrar");
const mesFiltro = document.getElementById("mesFiltro");
const anoFiltro = document.getElementById("anoFiltro");
const formLancamento = document.getElementById("formLancamento");

function iniciarSistema() {
  configurarAutenticacao();
  preencherMeses();
  anoFiltro.value = anoAtual;
  carregarLancamentos();
  controlarCamposPorTipo();
  definirDataHoje();
  aplicarEstadoAutenticacao();

  if (formLancamento) {
    formLancamento.addEventListener("submit", salvarLancamento);
  }
}

function configurarAutenticacao() {
  if (formEntrar) {
    formEntrar.addEventListener("submit", entrarNoSistema);
  }

  if (tabCadastrar) {
    tabCadastrar.classList.add("auth-hidden");
  }

  trocarAbaAuth("entrar");
  definirMensagemAuth("mensagemEntrar", "Use o e-mail liberado com a senha do sistema.");
}

function trocarAbaAuth(aba) {
  const entrarAtivo = aba === "entrar";

  if (formEntrar) {
    formEntrar.classList.toggle("auth-hidden", !entrarAtivo);
  }

  if (tabEntrar) {
    tabEntrar.classList.toggle("active", entrarAtivo);
  }

  limparMensagensAuth();
}

function aplicarEstadoAutenticacao() {
  if (usuarioEstaAutenticado()) {
    authShell.classList.add("auth-hidden");
    appShell.classList.remove("app-hidden");
    renderizarTudo();
    return;
  }

  authShell.classList.remove("auth-hidden");
  appShell.classList.add("app-hidden");
  trocarAbaAuth("entrar");
  definirMensagemAuth("mensagemEntrar", "Use o e-mail liberado com a senha do sistema.");
}

function usuarioEstaAutenticado() {
  return localStorage.getItem(SESSION_STORAGE_KEY) === "ativo";
}

function normalizarLogin(login) {
  return String(login || "").trim().toLowerCase();
}

function loginEhValido(login) {
  const loginNormalizado = normalizarLogin(login);
  const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginNormalizado);
  const numeroLimpo = loginNormalizado.replace(/\D/g, "");
  const numeroValido = numeroLimpo.length >= 8 && numeroLimpo.length <= 15;
  return emailValido || numeroValido;
}

function senhaEhValida(senha) {
  return String(senha || "").length >= 6;
}

function definirMensagemAuth(id, mensagem) {
  const elemento = document.getElementById(id);
  if (elemento) {
    elemento.textContent = mensagem;
  }
}

function limparMensagensAuth() {
  definirMensagemAuth("mensagemEntrar", "");
  definirMensagemAuth("mensagemCadastro", "");
}

function entrarNoSistema(event) {
  event.preventDefault();

  const login = document.getElementById("loginEntrar").value;
  const senha = document.getElementById("senhaEntrar").value;

  if (!loginEhValido(login)) {
    definirMensagemAuth("mensagemEntrar", "Digite um e-mail valido ou um numero com 8 a 15 digitos.");
    return;
  }

  if (!senhaEhValida(senha)) {
    definirMensagemAuth("mensagemEntrar", "A senha precisa ter no minimo 6 caracteres.");
    return;
  }

  const loginNormalizado = normalizarLogin(login);
  const loginConfere = loginNormalizado === FIXED_LOGIN;
  const senhaConfere = senha === FIXED_PASSWORD;

  if (!loginConfere || !senhaConfere) {
    definirMensagemAuth("mensagemEntrar", "Login ou senha invalidos.");
    return;
  }

  localStorage.setItem(SESSION_STORAGE_KEY, "ativo");
  formEntrar.reset();
  limparMensagensAuth();
  aplicarEstadoAutenticacao();
}

function sairDoSistema() {
  localStorage.removeItem(SESSION_STORAGE_KEY);
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

function carregarLancamentos() {
  const dados = localStorage.getItem(STORAGE_KEY);
  lancamentos = dados ? JSON.parse(dados) : [];
}

function salvarNoNavegador() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lancamentos));
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
          <td>${item.grupo}</td>
          <td>
            <strong>${item.descricao}</strong>
            ${item.observacao ? `<br><small>${item.observacao}</small>` : ""}
          </td>
          <td>${formatarMoeda(item.previsto)}</td>
          <td>${formatarMoeda(item.realizado)}</td>
          <td class="${classe}">${formatarMoeda(diferenca)}</td>
          <td>${formatarData(item.data)}</td>
          <td>
            <button class="btn btn-secondary btn-small" onclick="editarLancamento('${item.id}')">Editar</button>
            <button class="btn btn-danger btn-small" onclick="excluirLancamento('${item.id}')">Excluir</button>
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
          <td>${item.grupo}</td>
          <td>
            <strong>${item.descricao}</strong>
            ${item.observacao ? `<br><small>${item.observacao}</small>` : ""}
          </td>
          <td><span class="badge ${badgeClasse}">${item.classificacao}</span></td>
          <td>${formatarMoeda(item.previsto)}</td>
          <td>${formatarMoeda(item.realizado)}</td>
          <td class="${classe}">${formatarMoeda(diferenca)}</td>
          <td>${formatarData(item.data)}</td>
          <td>
            <button class="btn btn-secondary btn-small" onclick="editarLancamento('${item.id}')">Editar</button>
            <button class="btn btn-danger btn-small" onclick="excluirLancamento('${item.id}')">Excluir</button>
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
        <strong>${sugestao.titulo}</strong>
        <p>${sugestao.texto}</p>
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
      <p>${maiorReceita ? `${maiorReceita.grupo} trouxe ${formatarMoeda(maiorReceita.valor)}.` : "Nao houve ganhos cadastrados no mes anterior."}</p>
    </div>
    <div class="summary-item">
      <strong>Onde gastou mais</strong>
      <p>${maiorDespesa ? `${maiorDespesa.grupo} consumiu ${formatarMoeda(maiorDespesa.valor)}.` : "Nao houve gastos cadastrados no mes anterior."}</p>
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

document.addEventListener("DOMContentLoaded", iniciarSistema);
