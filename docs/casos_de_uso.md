# Casos de Uso – Fiado Control 

---

## UC01: Realizar Login no Sistema 

**Atores Envolvidos**: Funcionário, Gerente.  

**Requisito Associado**: RNF01 (Segurança e autenticação), RNF02 (Controle de acesso).  

**Pré-condições**: O ator deve possuir uma conta ativa com login e senha individuais criados previamente pelo gerente.  

**Interações (Fluxo Principal)**: 
1. O ator acessa a tela de entrada do sistema. 
2. O ator insere suas credenciais de acesso (login e senha).  
3. O sistema valida as informações. 
4. O sistema aplica a restrição estrita de telas de acordo com o perfil (Funcionário ou Gerente) e redireciona o ator para o ambiente correto.  

---

## UC02: Gerenciar Clientes (Buscar e Cadastrar) 

**Atores Envolvidos**: Funcionário, Gerente.  

**Requisito Associado**: RF02 (Buscar e selecionar cliente), RF03 (Cadastrar cliente rápido).  

**Pré-condições**: O ator deve estar com uma sessão ativa no sistema. 

**Interações (Fluxo Principal)**: 
1. O ator acessa a área de clientes ou inicia o processo de venda. 
2. O ator pesquisa o cliente utilizando filtros por nome, CPF ou telefone.  
3. O sistema retorna os dados do cliente se ele já existir.  
4. Caso não exista, o ator realiza o cadastro simplificado do novo cliente.  

---

## UC03: Registrar Venda (Fiado ou A Prazo) 

**Atores Envolvidos**: Funcionário, Gerente.  

**Requisito Associado**: RF01 (Registrar venda), RF04 (Consultar saldo devedor), RF07 (Aprovação de exceções).  

**Pré-condições**: O cliente deve estar selecionado na tela. 

**Interações (Fluxo Principal)**: 
1. O ator consulta o saldo devedor total em aberto e o histórico recente do cliente.  
2. O ator insere os produtos, os valores, a quantidade de parcelas, a data de vencimento e a modalidade (fiado ou a prazo).  
3. O sistema verifica o limite de crédito do cliente.  
4. Se o limite for excedido ou houver parcelas atrasadas, o sistema bloqueia a ação e exige a autorização manual do gerente.  
5. Com tudo aprovado, o sistema registra a venda no saldo devedor do cliente. 

---

## UC04: Registrar Pagamentos e Baixas 

**Atores Envolvidos**: Funcionário, Gerente.  

**Requisito Associado**: RF05 (Registrar pagamentos/baixas), RF10 (Configuração de cobrança e juros).  

**Pré-condições**: O cliente selecionado deve possuir parcelas ou saldo em aberto. 

**Interações (Fluxo Principal)**: 
1. O ator acessa a lista de parcelas devidas do cliente.  
2. O sistema calcula multas e juros automaticamente, caso a parcela esteja em atraso.  
3. O ator insere o valor recebido, concedendo abatimentos apenas se tiver permissão.  
4. O ator confirma a baixa total ou parcial da parcela.  
5. O sistema emite o comprovante de pagamento para o cliente.  

---

## UC05: Visualizar Dashboard Financeiro 

**Atores Envolvidos**: Gerente.  

**Requisito Associado**: RF09 (Dashboard financeiro), RNF02 (Restrição de acesso a relatórios consolidados para funcionários).  

**Pré-condições**: O ator deve estar autenticado com o perfil e as permissões de "Gerente".  

**Interações (Fluxo Principal)**: 
1. O gerente acessa a tela do Dashboard. 
2. O sistema processa os dados e exibe os relatórios de faturamento por período e o total a receber.  
3. O sistema exibe métricas de risco, como a taxa de inadimplência.  
4. O sistema lista e destaca as parcelas que já estão vencidas e aquelas que estão prestes a vencer. 
