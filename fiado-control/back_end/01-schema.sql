CREATE TABLE IF NOT EXISTS usuario (
    id_usuario SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    senha_hash VARCHAR(255) NOT NULL,
    perfil VARCHAR(20) NOT NULL CHECK (perfil IN ('gerente', 'funcionario')),
    ativo BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS cliente (
    id_cliente SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    cpf VARCHAR(14) UNIQUE NOT NULL,
    limite_credito DECIMAL(10,2) DEFAULT 0.00,
    credito_bloqueado BOOLEAN NOT NULL DEFAULT FALSE,
    ativo BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS cliente_telefone (
    id_telefone SERIAL PRIMARY KEY,
    id_cliente INT NOT NULL,
    numero VARCHAR(20) NOT NULL,
    FOREIGN KEY (id_cliente) REFERENCES cliente(id_cliente) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS venda (
    id_venda SERIAL PRIMARY KEY,
    id_cliente INT NOT NULL,
    id_usuario INT NOT NULL,
    data_venda TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    valor_total DECIMAL(10,2) NOT NULL,
    modalidade VARCHAR(20) NOT NULL CHECK (modalidade IN ('fiado', 'a_prazo')),
    status VARCHAR(20) DEFAULT 'aprovada' CHECK (status IN ('aprovada', 'rejeitada', 'pendente_autorizacao')),
    motivo_rejeicao VARCHAR(100),
    autorizado_por INT,
    FOREIGN KEY (id_cliente) REFERENCES cliente(id_cliente),
    FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario),
    FOREIGN KEY (autorizado_por) REFERENCES usuario(id_usuario)
);

CREATE TABLE IF NOT EXISTS pagamento (
    id_pagamento SERIAL PRIMARY KEY,
    id_venda INT NOT NULL,
    valor_parcela DECIMAL(10,2) NOT NULL,
    data_vencimento DATE NOT NULL,
    data_pagamento DATE,
    status VARCHAR(20) NOT NULL CHECK (status IN ('pendente', 'pago', 'atrasado')),
    FOREIGN KEY (id_venda) REFERENCES venda(id_venda) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS configuracao (
    id_configuracao SERIAL PRIMARY KEY,
    taxa_juros DECIMAL(5,2) NOT NULL,
    taxa_multa DECIMAL(5,2) NOT NULL,
    definido_por INT NOT NULL,
    FOREIGN KEY (definido_por) REFERENCES usuario(id_usuario)
);

CREATE TABLE IF NOT EXISTS recebimento (
    id_recebimento SERIAL PRIMARY KEY,
    id_pagamento INT NOT NULL,
    valor_recebido DECIMAL(10,2) NOT NULL,
    valor_juros DECIMAL(10,2) NOT NULL DEFAULT 0,
    valor_multa DECIMAL(10,2) NOT NULL DEFAULT 0,
    data_pagamento DATE NOT NULL DEFAULT CURRENT_DATE,
    id_usuario INT,
    FOREIGN KEY (id_pagamento) REFERENCES pagamento(id_pagamento) ON DELETE CASCADE,
    FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario)
);

CREATE INDEX IF NOT EXISTS cliente_cpf_idx ON cliente (cpf);
CREATE INDEX IF NOT EXISTS cliente_nome_idx ON cliente (nome);
CREATE INDEX IF NOT EXISTS venda_cliente_idx ON venda (id_cliente);
CREATE INDEX IF NOT EXISTS venda_status_idx ON venda (status);
CREATE INDEX IF NOT EXISTS venda_modalidade_idx ON venda (modalidade);
CREATE INDEX IF NOT EXISTS venda_data_venda_idx ON venda (data_venda);
CREATE INDEX IF NOT EXISTS pagamento_venda_idx ON pagamento (id_venda);
CREATE INDEX IF NOT EXISTS recebimento_pagamento_idx ON recebimento (id_pagamento);