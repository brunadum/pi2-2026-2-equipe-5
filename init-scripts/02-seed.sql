INSERT INTO usuario (nome, email, senha_hash, perfil) VALUES 
('João Silva', 'vendedor@loja.com', 'hash123', 'vendedor'), -- Usar no Teste 1
('Maria Souza', 'gerente@loja.com', 'hash123', 'gerente'),
('Carlos Lima', 'carlos@loja.com', 'hash123', 'vendedor'),
('Ana Paula', 'ana@loja.com', 'hash123', 'vendedor'),
('Pedro Alves', 'pedro@loja.com', 'hash123', 'vendedor'),
('Lucas Mendes', 'lucas@loja.com', 'hash123', 'vendedor'),
('Juliana Costa', 'juliana@loja.com', 'hash123', 'vendedor'),
('Marcos Dias', 'marcos@loja.com', 'hash123', 'vendedor'),
('Fernanda Rocha', 'fernanda@loja.com', 'hash123', 'vendedor'),
('Rafael Gomes', 'rafael@loja.com', 'hash123', 'vendedor');

INSERT INTO cliente (nome, cpf, telefone, limite_credito) VALUES 
('Cliente Bom Pagador', '111.111.111-11', '(88) 91111-1111', 1000.00), -- Teste 2
('Cliente Sem Limite', '222.222.222-22', '(88) 92222-2222', 0.00),    -- Teste 3
('Cliente Inadimplente', '333.333.333-33', '(88) 93333-3333', 500.00), -- Teste 4
('Roberto Justo', '444.444.444-44', '(88) 94444-4444', 300.00),
('Camila Pitanga', '555.555.555-55', '(88) 95555-5555', 400.00),
('Tiago Leifert', '666.666.666-66', '(88) 96666-6666', 800.00),
('Fátima Bernardes', '777.777.777-77', '(88) 97777-7777', 150.00),
('Rodrigo Faro', '888.888.888-88', '(88) 98888-8888', 250.00),
('Eliana Michaelichen', '999.999.999-99', '(88) 99999-9999', 600.00),
('Celso Portiolli', '000.000.000-00', '(88) 90000-0000', 700.00);

INSERT INTO venda (id_cliente, id_usuario, valor_total, modalidade) VALUES 
(3, 1, 150.00, 'fiado'),   -- Venda que vai gerar o atraso do Cliente 3
(1, 1, 200.00, 'fiado'),   -- Venda normal do Cliente Bom Pagador
(4, 2, 50.00, 'a_prazo'),
(5, 1, 100.00, 'fiado'),
(6, 1, 300.00, 'a_prazo'),
(7, 2, 80.00, 'fiado'),
(8, 1, 120.00, 'a_prazo'),
(9, 1, 400.00, 'fiado'),
(10, 2, 60.00, 'fiado'),
(4, 1, 90.00, 'a_prazo');

INSERT INTO pagamento (id_venda, valor_parcela, data_vencimento, status) VALUES 
(1, 150.00, '2026-08-15', 'atrasado'), -- Bloqueia o Cliente 3 (Teste 4)
(2, 100.00, '2026-10-10', 'pendente'), -- QA dá baixa (Teste 5)
(2, 100.00, '2026-11-10', 'pendente'),
(3, 25.00, '2026-09-01', 'pago'),
(3, 25.00, '2026-10-01', 'pendente'),
(4, 100.00, '2026-10-05', 'pendente'),
(5, 150.00, '2026-09-20', 'atrasado'),
(5, 150.00, '2026-10-20', 'pendente'),
(6, 80.00, '2026-10-15', 'pendente'),
(7, 120.00, '2026-11-05', 'pendente');
