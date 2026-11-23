# Plano de ajustes de usabilidade — telas do fluxo principal (Sprint 5)

> Responsável: Frontend 1 · Requisitos relacionados: **RNF04** (facilidade de utilização), **RNF03** (responsividade), RF14, RF01, RF02, RF04, RF05

## 1. Objetivo

Organizar os ajustes de usabilidade das telas do **fluxo principal** — as que o funcionário usa todo dia — a partir do retorno da sessão de validação com o cliente (Casa do Produtor), para que cada ajuste vire issue com label do requisito afetado, prioridade definida pelo cliente e responsável.

Fluxo principal considerado (ordem de uso real):

1. **Login** (`login.html`) → 2. **Nova Venda** (`nova-venda.html`) → 3. **Busca / cadastro rápido de cliente** (componente da Nova Venda e `clientes.html`) → 4. **Registrar Pagamento** (`registrar-pagamento.html`) → 5. **Comprovantes** (`comprovante-venda.html`, `comprovante-pagamento.html`)

## 2. Como o plano é alimentado

| Fonte | Quem registra | Onde |
|---|---|---|
| Ata da sessão de validação (data, participantes, o que foi pedido) | Requisitos + QA | ata no repositório (link na seção 4) |
| Onde o usuário travou, hesitou ou errou | Design | registro do Design |
| Defeitos com evidência | QA | issues de defeito |
| Inspeção das telas pelo Frontend 1 (antes da sessão) | Frontend 1 | seção 3 deste documento |

Regra da sprint: **o retorno do usuário vai para os Requisitos, vira issue com label do requisito afetado e é priorizado pelo cliente.** Este plano não muda requisito nenhum sozinho: os itens abaixo são **propostas** que entram na lista de ajustes e só são implementados depois da priorização.

## 3. Pontos já identificados (inspeção do Frontend 1 em 23/11/2026)

Feita percorrendo o fluxo principal com o perfil **Funcionário**, no ambiente local, com a versão atual do repositório. Cada item deve ser **confirmado ou descartado na sessão** com o cliente.

| ID | Tela | Problema observado | Impacto para o usuário | Ajuste proposto | Req. | Prioridade sugerida |
|---|---|---|---|---|---|---|
| U01 | Login | O campo se chama **"Nome do usuário"** com o exemplo `edmilson.filho`, mas o sistema só aceita **e-mail**. | O funcionário digita o nome, recebe "credenciais inválidas" e acha que esqueceu a senha. Bloqueia a entrada no sistema. | Renomear para **"E-mail"**, usar `type="email"` e exemplo `nome@loja.com`; texto "Insira seu e-mail e senha". | RF14, RNF04 | **Alta** |
| U02 | Login | "Esqueceu a senha?" e "Solicitar acesso" parecem funcionar, mas não levam a lugar nenhum. | Usuário clica, nada acontece ou só aparece aviso; gera dúvida. | Trocar por um texto claro: "Esqueceu a senha? Fale com o gerente da loja." (o gerente cadastra/edita usuários — RF08). | RF14, RF08 | Média |
| U03 | Nova Venda | O aviso **"Selecione um cliente."** aparece só no rodapé do painel da direita, longe do campo de busca; o botão "Registrar venda" fica verde-claro sem explicar o motivo. | Usuário não entende por que não consegue registrar a venda. | Mostrar o motivo perto do botão **e** destacar o campo de cliente (borda/ícone) enquanto ele não for escolhido. | RF01, RF02, RNF04 | Alta |
| U04 | Nova Venda | Botão **"+ Cadastrar cliente rápido"** tem ícone e "+" ao mesmo tempo. | Ruído visual pequeno. | Remover o "+" do texto (o ícone já indica). | RF03 | Baixa |
| U05 | Nova Venda | O vencimento vem preenchido com **30 dias** sem destaque. | Em fiado de curto prazo o funcionário pode não perceber e registrar a data errada. | Confirmar com o cliente o prazo padrão da loja e mostrar o vencimento no resumo antes de confirmar. | RF01 | Média (confirmar) |
| U06 | Nova Venda | Campo **Desconto (R$ / %)** visível para o funcionário. | Pela matriz de perfis, desconto é do gerente "salvo permissão". Pode gerar tentativa que depois é negada. | Confirmar regra na sessão; se for só do gerente, esconder para o funcionário (alinhar com Frontend 2 — interface por perfil). | RF10, RNF02 | Média (confirmar) |
| U07 | Registrar Pagamento | O campo **"Valor da baixa"** fica desabilitado (cinza) até marcar uma parcela, e a dica "Selecione ao menos uma parcela" fica no painel da direita. | Usuário tenta digitar o valor primeiro e acha que a tela travou. | Texto no próprio campo: "Marque uma parcela à esquerda"; ou selecionar automaticamente a parcela mais antiga quando houver só uma. | RF05, RNF04 | Alta |
| U08 | Registrar Pagamento | Caixas de seleção das parcelas são pequenas (≈18 px) e a linha inteira não é clicável. | Difícil acertar no celular (RNF03). | Tornar a linha toda clicável e aumentar a área de toque para ≥ 40 px. | RF05, RNF03 | Média |
| U09 | Fluxo todo | Termos diferentes para a mesma coisa: "Pagamento", "Baixa", "Liquidação", "Abatimento". | Usuário não sabe se são operações diferentes. | Padronizar com o vocabulário da loja (definir na sessão) e revisar textos com o Design. | RNF04 | Média |
| U10 | Fluxo todo (celular) | Tabelas largas (parcelas, clientes) rolam para o lado dentro do quadro sem indicação. | Usuário não percebe que existem mais colunas (ex.: valor). | Em telas < 640 px, mostrar as colunas essenciais (cliente, valor, situação) e esconder as secundárias, ou exibir em cartões. | RNF03 | Média |

## 4. Retorno da sessão de validação (preencher após a sessão)

- **Ata:** _link para a ata no repositório (Requisitos/QA)_
- **Data da sessão:** __/__/2026 · **Participantes:** _cliente, Requisitos, QA, Design_

| ID | Tela | O que o usuário fez / disse (ata) | Travou, hesitou ou errou? (Design) | Ajuste combinado | Prioridade **do cliente** | Req. afetado | Issue | Responsável | Status |
|---|---|---|---|---|---|---|---|---|---|
| S01 | | | | | | | #__ | | A fazer |
| S02 | | | | | | | #__ | | A fazer |
| S03 | | | | | | | #__ | | A fazer |

Para cada item da seção 3 confirmado na sessão, copiar a linha para esta tabela com a prioridade dada pelo cliente.

## 5. Critérios para priorizar

1. **Alta** — impede concluir o fluxo principal (entrar, vender, receber) ou leva a erro financeiro.
2. **Média** — o usuário conclui, mas hesita, erra e corrige, ou precisa de ajuda.
3. **Baixa** — incômodo visual/texto que não atrapalha a tarefa.

Empates são decididos pelo cliente. Ajustes de **texto/mensagem** passam pelo Design; ajustes de **regra** (ex.: U05, U06) passam pelos Requisitos antes de virar código.

## 6. Como cada ajuste vira entrega

1. Requisitos cria a issue com label do RF/RNF afetado, estimativa, critérios de aceitação e resultado esperado.
2. O responsável da tela implementa **apenas a tela da issue** (evita conflito entre frentes).
3. QA reverifica com o mesmo cenário da sessão e anexa evidência na issue.
4. A linha da seção 4 muda para **Concluído** com o link do PR.

## 7. Fora deste plano

- Mudanças de regra de negócio sem aprovação do cliente.
- Telas administrativas (Relatórios, Configurações, Usuários, Auditoria) — não fazem parte do fluxo principal do funcionário.
- Ajustes de responsividade e mensagens de erro apontados na sessão, que são do plano do Frontend 3.
