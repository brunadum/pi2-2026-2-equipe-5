from django.db import migrations


PERFIS_SQL = """
CREATE TABLE IF NOT EXISTS perfil (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(50) UNIQUE NOT NULL,
    descricao VARCHAR(255)
);
INSERT INTO perfil (nome, descricao) VALUES
    ('ADMIN', 'Acesso total'), ('COMUM', 'Acesso às vendas')
ON CONFLICT (nome) DO NOTHING;
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS id_perfil INTEGER REFERENCES perfil(id);
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'usuario' AND column_name = 'perfil'
    ) THEN
        UPDATE usuario u SET id_perfil = p.id
        FROM perfil p
        WHERE u.id_perfil IS NULL AND p.nome = CASE UPPER(u.perfil)
            WHEN 'GERENTE' THEN 'ADMIN' WHEN 'ADMIN' THEN 'ADMIN'
            WHEN 'FUNCIONARIO' THEN 'COMUM' WHEN 'COMUM' THEN 'COMUM' END;
        ALTER TABLE usuario DROP COLUMN perfil;
    END IF;
END $$;
"""


class Migration(migrations.Migration):
    dependencies = [('core', '0002_auditoria_credito')]
    # A conversão preserva IDs, credenciais e perfis; não recria contas nem o banco.
    operations = [migrations.RunSQL(PERFIS_SQL)]
