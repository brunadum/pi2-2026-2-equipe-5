"""Conversão de bases legadas e compatibilidade com bases já normalizadas."""

from importlib import import_module

from django.db import connection, transaction
from django.test import TransactionTestCase


class MigracaoPerfisTests(TransactionTestCase):
    def test_converte_base_legada_sem_perder_identidade_ou_credencial(self):
        sql = import_module('core.migrations.0003_integrar_perfis_usuario').PERFIS_SQL
        with transaction.atomic(), connection.cursor() as cursor:
            cursor.execute('CREATE SCHEMA teste_migracao_perfis; SET LOCAL search_path TO teste_migracao_perfis')
            cursor.execute('''CREATE TABLE usuario (
                id_usuario SERIAL PRIMARY KEY, email TEXT, senha_hash TEXT,
                perfil VARCHAR(20) NOT NULL, ativo BOOLEAN DEFAULT TRUE);
                INSERT INTO usuario (email, senha_hash, perfil) VALUES
                    ('gerente@teste', 'hash-preservado', 'gerente'),
                    ('funcionario@teste', 'outro-hash', 'funcionario');''')
            cursor.execute(sql)
            cursor.execute('''SELECT u.id_usuario, u.email, u.senha_hash, p.nome, u.ativo
                              FROM usuario u JOIN perfil p ON p.id = u.id_perfil ORDER BY u.id_usuario''')
            self.assertEqual(cursor.fetchall(), [
                (1, 'gerente@teste', 'hash-preservado', 'ADMIN', True),
                (2, 'funcionario@teste', 'outro-hash', 'COMUM', True),
            ])
            cursor.execute(sql)
            cursor.execute('SELECT COUNT(*) FROM perfil')
            self.assertEqual(cursor.fetchone()[0], 2)
            transaction.set_rollback(True)

    def test_preserva_perfil_existente_em_base_ja_normalizada(self):
        sql = import_module('core.migrations.0003_integrar_perfis_usuario').PERFIS_SQL
        with transaction.atomic(), connection.cursor() as cursor:
            cursor.execute('CREATE SCHEMA teste_migracao_normalizada; SET LOCAL search_path TO teste_migracao_normalizada')
            cursor.execute('''CREATE TABLE perfil (id SERIAL PRIMARY KEY, nome VARCHAR(50) UNIQUE NOT NULL, descricao VARCHAR(255));
                INSERT INTO perfil (nome) VALUES ('gerente');
                CREATE TABLE usuario (id_usuario SERIAL PRIMARY KEY, id_perfil INTEGER REFERENCES perfil(id));
                INSERT INTO usuario (id_perfil) VALUES (1);''')
            cursor.execute(sql)
            cursor.execute('SELECT p.nome FROM usuario u JOIN perfil p ON p.id = u.id_perfil')
            self.assertEqual(cursor.fetchone(), ('gerente',))
            transaction.set_rollback(True)
