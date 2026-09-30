CREATE TABLE usuario (
    id_usuario SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    senha_hash VARCHAR(255) NOT NULL,
    perfil VARCHAR(20) NOT NULL CHECK (perfil IN ('gerente', 'funcionario')),
    ativo BOOLEAN DEFAULT TRUE
);

CREATE TABLE cliente (
    id_cliente SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    cpf VARCHAR(14) UNIQUE NOT NULL,
    limite_credito DECIMAL(10,2) DEFAULT 0.00,
    ativo BOOLEAN DEFAULT TRUE
);

CREATE TABLE cliente_telefone (
    id_telefone SERIAL PRIMARY KEY,
    id_cliente INT NOT NULL,
    numero VARCHAR(20) NOT NULL,
    FOREIGN KEY (id_cliente) REFERENCES cliente(id_cliente) ON DELETE CASCADE
);

CREATE TABLE venda (
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

CREATE TABLE pagamento (
    id_pagamento SERIAL PRIMARY KEY,
    id_venda INT NOT NULL,
    valor_parcela DECIMAL(10,2) NOT NULL,
    data_vencimento DATE NOT NULL,
    data_pagamento DATE,
    status VARCHAR(20) NOT NULL CHECK (status IN ('pendente', 'pago', 'atrasado')),
    FOREIGN KEY (id_venda) REFERENCES venda(id_venda) ON DELETE CASCADE
);

CREATE TABLE configuracao (
    id_configuracao SERIAL PRIMARY KEY,
    taxa_juros DECIMAL(5,2) NOT NULL,
    taxa_multa DECIMAL(5,2) NOT NULL,
    definido_por INT NOT NULL,
    FOREIGN KEY (definido_por) REFERENCES usuario(id_usuario)
);
