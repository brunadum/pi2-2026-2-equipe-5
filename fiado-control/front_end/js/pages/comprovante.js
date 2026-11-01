// Páginas "Comprovante de venda" e "Comprovante de pagamento": mostram o comprovante e permitem imprimir.
(function () {
  const FC = window.FC;
  const { moeda, dataBR, cpf: fmtCpf, telefone: fmtTel, escapeHtml: h } = FC.format;
  const $ = (id) => document.getElementById(id);
  const tipo = document.body.dataset.tipo;
  const params = new URLSearchParams(location.search);
  const pad = (n, t = 6) => String(n).replace(/^L/, "").padStart(t, "0");
  const par = (n, t) => `${String(n).padStart(2, "0")}/${String(t).padStart(2, "0")}`;

  FC.ui.initSidebar();

  const ICONE_MARCA = '<svg viewBox="0 0 24 24"><path d="M7 12 10 9a2 2 0 0 1 3 0l1 1M5 9l2-2a2 2 0 0 1 3 0l1 1m7 1-2-2a2 2 0 0 0-3 0l-5 5a2 2 0 0 0 3 3l2-2M3 6v12h18V6"/></svg>';
  const ICONE_OK = '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';

  function dataHora(iso) {
    const d = new Date(iso);
    return `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  }

  function topo(c, titulo, numero, statusTxt) {
    return `<header class="cp-topo">
      <div class="cp-marca"><span class="logo">${ICONE_MARCA}</span><div><strong>Fiado Control</strong><small>Gestão de Vendas</small></div></div>
      <div class="cp-doc"><h2>${titulo}</h2><span class="numero">Nº ${h(numero)}</span><small>Emitido em ${dataHora(c.emitidoEm)}</small>
        <span class="cp-status">${ICONE_OK}${statusTxt}</span></div>
    </header>`;
  }

  function blocoCliente(cli) {
    const tel = Array.isArray(cli.telefone) ? cli.telefone[0] : cli.telefone;
    return `<section class="cp-secao"><h3>Dados do cliente</h3>
      <div class="cp-caixa"><dl class="cp-grade">
        <div><dt>Nome</dt><dd>${h(cli.nome || "—")}</dd></div>
        <div><dt>CPF</dt><dd>${cli.cpf ? h(fmtCpf(cli.cpf)) : "Não informado"}</dd></div>
        <div><dt>Telefone</dt><dd>${tel ? h(fmtTel(tel)) : "Não informado"}</dd></div>
      </dl></div></section>`;
  }

  function rodape(c) {
    return `<div class="cp-assinatura"><div>Assinatura do cliente</div><div>${c.operador ? "Atendente: " + h(c.operador) : "Responsável pelo atendimento"}</div></div>
      <p class="cp-rodape">Documento de controle interno, sem valor fiscal. Guarde este comprovante.<br>Fiado Control · emitido em ${dataHora(c.emitidoEm)}</p>`;
  }

  // ------------------------------------------------------------------ venda
  function renderVenda(c) {
    const itens = c.itens || [];
    const linhasItens = itens.length
      ? itens.map((i, k) => `<tr><td class="mudo">${k + 1}</td><td class="forte">${h(i.nome)}</td><td class="dir">${h(i.qtd)}</td><td class="dir">${moeda(i.preco)}</td><td class="dir forte">${moeda(i.qtd * i.preco)}</td></tr>`).join("")
      : `<tr><td colspan="5" class="mudo">Itens não registrados para esta venda.</td></tr>`;
    const n = c.parcelas?.length || c.nParcelas || 1;
    const parcelas = (c.parcelas || []).map((p) => `<tr><td class="forte">${par(p.numero, n)}</td><td>${dataBR(p.vencimento)}</td><td class="dir forte">${moeda(p.valor)}</td></tr>`).join("");
    const primeira = c.parcelas?.[0];
    return `${topo(c, "Comprovante de Venda", pad(c.numero), "Venda aprovada")}
      ${blocoCliente(c.cliente)}
      <section class="cp-secao"><h3>Produtos comprados</h3>
        <div class="cp-tabela-wrap"><table class="cp-tabela"><thead><tr><th>#</th><th>Descrição</th><th class="dir">Qtd.</th><th class="dir">Preço unit.</th><th class="dir">Subtotal</th></tr></thead><tbody>${linhasItens}</tbody></table></div>
        <div class="cp-totais">
          <div><span>Subtotal</span><strong>${moeda(c.subtotal)}</strong></div>
          ${c.desconto > 0 ? `<div class="desc"><span>Desconto</span><strong>− ${moeda(c.desconto)}</strong></div>` : ""}
          <div class="total"><span>Total da venda</span><strong>${moeda(c.total)}</strong></div>
        </div></section>
      <section class="cp-secao"><h3>Condições de pagamento</h3>
        <div class="cp-caixa"><dl class="cp-grade">
          <div><dt>Tipo de venda</dt><dd>${h(c.tipoVenda)}</dd></div>
          <div><dt>Parcelamento</dt><dd>${n === 1 ? "1x (parcela única)" : `${n}x`}</dd></div>
          <div><dt>${n === 1 ? "Vencimento" : "1º vencimento"}</dt><dd>${primeira ? dataBR(primeira.vencimento) : "—"}</dd></div>
          <div><dt>Valor da parcela</dt><dd>${primeira ? moeda(primeira.valor) : moeda(c.total)}</dd></div>
        </dl></div></section>
      ${parcelas ? `<section class="cp-secao"><h3>Cronograma de parcelas</h3><div class="cp-tabela-wrap"><table class="cp-tabela"><thead><tr><th>Parcela</th><th>Vencimento</th><th class="dir">Valor</th></tr></thead><tbody>${parcelas}</tbody></table></div></section>` : ""}
      ${rodape(c)}`;
  }

  // -------------------------------------------------------------- pagamento
  function renderPagamento(c) {
    const linhas = c.linhas.map((l) => `<tr>
      <td class="forte">#${h(String(l.idVenda).replace(/^L/, ""))}</td><td>${par(l.numero, l.total)}</td><td>${l.vencimento ? dataBR(l.vencimento) : "—"}</td>
      <td class="dir forte">${moeda(l.valor)}</td><td class="dir mudo">${moeda(l.saldoParcela)}</td>
      <td class="dir"><span class="pill ${l.quitada ? "ok" : "parcial"}">${l.quitada ? "Quitada" : "Parcial"}</span></td></tr>`).join("");
    const vendas = c.vendas.map((v) => {
      const pct = v.total_parcelas ? Math.round((v.pagas / v.total_parcelas) * 100) : 0;
      const itens = (v.itens || []).map((i) => `<li><span>${h(i.qtd)}× ${h(i.nome)}</span><span>${moeda(i.qtd * i.preco)}</span></li>`).join("");
      return `<div class="cp-bloco-venda cp-caixa"><h4>Venda #${h(String(v.idVenda).replace(/^L/, ""))}${v.data ? `<small>${dataBR(v.data)}</small>` : ""}${v.valor_total ? `<small>· Total ${moeda(v.valor_total)}</small>` : ""}</h4>
        ${itens ? `<ul class="cp-itens-compra">${itens}</ul>` : ""}
        <div class="cp-progresso"><div class="barra" role="img" aria-label="${v.pagas} de ${v.total_parcelas} parcelas pagas"><i style="width:${pct}%"></i></div>
          <p><span><strong>${v.pagas}</strong> de ${v.total_parcelas} ${v.total_parcelas === 1 ? "parcela paga" : "parcelas pagas"}</span><span>${v.restantes === 0 ? "<strong>Venda quitada</strong>" : `Faltam <strong>${v.restantes}</strong> ${v.restantes === 1 ? "parcela" : "parcelas"}`}</span></p></div></div>`;
    }).join("");
    return `${topo(c, "Comprovante de Pagamento", pad(c.numero), "Pagamento registrado")}
      ${blocoCliente(c.cliente)}
      <section class="cp-secao"><h3>Pagamento realizado</h3>
        <div class="cp-destaque"><div><small>Valor pago</small><strong>${moeda(c.valorTotal)}</strong></div>
          <div class="forma"><small>Forma de pagamento</small>${h(c.forma)}<br><small>${dataBR(c.emitidoEm.slice(0, 10))}</small></div></div></section>
      <section class="cp-secao"><h3>Parcelas baixadas</h3>
        <div class="cp-tabela-wrap"><table class="cp-tabela"><thead><tr><th>Venda</th><th>Parcela</th><th>Vencimento</th><th class="dir">Valor pago</th><th class="dir">Saldo da parcela</th><th class="dir">Situação</th></tr></thead><tbody>${linhas}</tbody></table></div></section>
      <section class="cp-secao"><h3>Compra e andamento das parcelas</h3>${vendas}
        <div class="cp-totais"><div class="total"><span>Saldo devedor restante</span><strong>${moeda(c.saldoRestante)}</strong></div></div></section>
      ${rodape(c)}`;
  }

  // ----------------------------------------------------------------- início
  const papel = $("papel");
  const estado = $("estado");

  function naoEncontrado() {
    estado.hidden = false;
    estado.innerHTML = `<strong>Comprovante não encontrado</strong>
      <span>Ele é guardado no navegador onde a operação foi feita. Abra-o pelo mesmo computador ou refaça a operação.</span>`;
    $("btn-imprimir").disabled = true;
  }

  const c = FC.comprovantes.obter(params.get("id") || "");
  if (!c || c.tipo !== tipo) naoEncontrado();
  else {
    papel.innerHTML = tipo === "venda" ? renderVenda(c) : renderPagamento(c);
    papel.hidden = false;
    document.title = `${tipo === "venda" ? "Comprovante de Venda" : "Comprovante de Pagamento"} ${pad(c.numero)} | Fiado Control`;
    if (c.cliente?.id && tipo === "pagamento") $("btn-voltar").href = `cliente-detalhes.html?id=${encodeURIComponent(c.cliente.id)}`;
  }

  $("btn-imprimir").addEventListener("click", () => window.print());
  if (window.opener) {
    $("btn-fechar").hidden = false;
    $("btn-voltar").hidden = true;
    $("btn-fechar").addEventListener("click", () => window.close());
  }
  if (c && params.get("imprimir") === "1") setTimeout(() => window.print(), 400);
})();
