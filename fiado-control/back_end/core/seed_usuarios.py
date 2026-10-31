import os
import sys
import django

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings') 
django.setup()

from django.db import connection
from django.contrib.auth.hashers import make_password

def gerar_usuarios():
    senha_segura = make_password('Fiad0@2026!')

    with connection.cursor() as cursor:
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS perfil (
                id SERIAL PRIMARY KEY,
                nome VARCHAR(50) UNIQUE NOT NULL, 
                descricao VARCHAR(255)
            );
        """)

        cursor.execute("""
            ALTER TABLE usuario DROP COLUMN IF EXISTS perfil;
            ALTER TABLE usuario ADD COLUMN IF NOT EXISTS id_perfil INT REFERENCES perfil(id);
        """)

        cursor.execute("INSERT INTO perfil (nome, descricao) VALUES ('ADMIN', 'Acesso total') ON CONFLICT DO NOTHING;")
        cursor.execute("INSERT INTO perfil (nome, descricao) VALUES ('COMUM', 'Acesso as vendas') ON CONFLICT DO NOTHING;")
        
        cursor.execute("""
            INSERT INTO usuario (nome, email, senha_hash, id_perfil) 
            VALUES ('Administrador', 'admin@teste.com', %s, (SELECT id FROM perfil WHERE nome = 'ADMIN'))
            ON CONFLICT (email) DO NOTHING;
        """, [senha_segura])

if __name__ == '__main__':
    gerar_usuarios()
    print("Tabelas corrigidas e Usuário criado com sucesso!")