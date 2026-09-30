INSERT INTO usuario (nome, email, senha_hash, perfil) VALUES 
('Carlos Funcionario', 'funcionario@loja.com', 'hash123', 'funcionario'),
('Maria Gerente', 'gerente@loja.com', 'hash123', 'gerente'),
('Ana Vendedora', 'ana@loja.com', 'hash123', 'funcionario');

INSERT INTO cliente (nome, cpf, limite_credito) VALUES 
('João Silva', '111.111.111-11', 1500.00),          
('Maria Souza', '12345678900', 500.00),             -- Cliente base da documentação da API
('João Lima', '333.333.333-33', 800.00),            -- Cliente para teste de atraso no dashboard
('Cliente Sem Limite', '222.222.222-22', 0.00),     -- Para testar venda rejeitada
('Pedro Alves', '444.444.444-44', 1000.00),
('Lucas Mendes', '555.555.555-55', 1200.00),
('Fernanda Costa', '666.666.666-66', 300.00),
('Camila Rocha', '777.777.777-77', 2000.00),
('Bruno Santos', '888.888.888-88', 600.00),
('Amanda Ribeiro', '999.999.999-99', 400.00);

INSERT INTO cliente_telefone (id_cliente, numero) VALUES 
(1, '88999991111'),
(2, '88999990000'),
(2, '8833330000'), 
(3, '88999993333'),
(4, '88999994444'),
(5, '88999995555'),
(6, '88999996666'),
(7, '88999997777'),
(8, '88999998888'),
(9, '88999999999'),
(10, '88999990001');

INSERT INTO venda (id_cliente, id_usuario, valor_total, modalidade, status, motivo_rejeicao, autorizado_por) VALUES 
(1, 1, 500.00, 'a_prazo', 'aprovada', NULL, NULL),                 -- Venda 1: Gera a parcela do CT-002
(2, 1, 300.00, 'a_prazo', 'aprovada', NULL, NULL),                 -- Venda 2: Maria Souza (API)
(3, 1, 120.00, 'fiado', 'aprovada', NULL, NULL),                   -- Venda 3: João Lima (API atrasados)
(4, 1, 300.00, 'fiado', 'rejeitada', 'limite_credito_excedido', NULL), -- Venda 4: Rejeitada automática
(5, 3, 150.00, 'fiado', 'aprovada', NULL, NULL),                   -- Venda 5: Venda normal
(6, 3, 800.00, 'a_prazo', 'aprovada', NULL, NULL),                 -- Venda 6: Venda normal
(7, 1, 400.00, 'fiado', 'rejeitada', 'limite_credito_excedido', NULL), -- Venda 7: Rejeitada que ficará assim
(7, 1, 400.00, 'fiado', 'aprovada', NULL, 2),                      -- Venda 8: Exceção aprovada pelo Gerente (id 2)
(8, 1, 1000.00, 'a_prazo', 'aprovada', NULL, NULL),                -- Venda 9: Venda normal
(9, 3, 50.00, 'fiado', 'aprovada', NULL, NULL);                    -- Venda 10: Venda normal

INSERT INTO pagamento (id_venda, valor_parcela, data_vencimento, data_pagamento, status) VALUES 
(1, 500.00, '2026-10-10', NULL, 'pendente'),             
(2, 150.00, '2026-10-05', NULL, 'pendente'),             
(2, 150.00, '2026-11-05', NULL, 'pendente'),             
(3, 120.00, '2026-09-10', NULL, 'atrasado'),             
(5, 150.00, '2026-09-20', '2026-09-20', 'pago'),         
(6, 400.00, '2026-10-15', NULL, 'pendente'),             
(6, 400.00, '2026-11-15', NULL, 'pendente'),             
(8, 400.00, '2026-10-01', NULL, 'pendente'),             
(9, 500.00, '2026-08-01', '2026-08-01', 'pago'),         
(9, 500.00, '2026-09-01', NULL, 'atrasado'),             
(10, 50.00, '2026-09-25', NULL, 'pendente');

INSERT INTO configuracao (taxa_juros, taxa_multa, definido_por) VALUES 
(0.02, 0.05, 2);
