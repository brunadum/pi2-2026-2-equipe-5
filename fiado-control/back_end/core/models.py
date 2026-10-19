from django.db import models

class Usuario(models.Model):
    id_usuario = models.AutoField(primary_key=True)
    nome = models.CharField(max_length=100)
    email = models.CharField(max_length=100, unique=True)
    senha_hash = models.CharField(max_length=255)
    perfil = models.CharField(max_length=20)
    ativo = models.BooleanField(default=True)

    class Meta:
        db_table = 'usuario'
        managed = False


class Cliente(models.Model):
    id_cliente = models.AutoField(primary_key=True)
    nome = models.CharField(max_length=100)
    cpf = models.CharField(max_length=14, unique=True)
    limite_credito = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    credito_bloqueado = models.BooleanField(default=False)
    ativo = models.BooleanField(default=True)

    class Meta:
        db_table = 'cliente'
        managed = False


class ClienteTelefone(models.Model):
    id_telefone = models.AutoField(primary_key=True)
    id_cliente = models.ForeignKey(Cliente, on_delete=models.CASCADE, db_column='id_cliente')
    numero = models.CharField(max_length=20)

    class Meta:
        db_table = 'cliente_telefone'
        managed = False


class Venda(models.Model):
    id_venda = models.AutoField(primary_key=True)
    id_cliente = models.ForeignKey(Cliente, on_delete=models.CASCADE, db_column='id_cliente')
    id_usuario = models.ForeignKey(Usuario, on_delete=models.CASCADE, db_column='id_usuario')
    data_venda = models.DateTimeField(auto_now_add=True)
    valor_total = models.DecimalField(max_digits=10, decimal_places=2)
    modalidade = models.CharField(max_length=20)
    status = models.CharField(max_length=20, default='aprovada')
    motivo_rejeicao = models.CharField(max_length=100, null=True, blank=True)
    autorizado_por = models.ForeignKey(Usuario, null=True, blank=True, on_delete=models.SET_NULL, related_name='vendas_autorizadas', db_column='autorizado_por')

    class Meta:
        db_table = 'venda'
        managed = False


class Pagamento(models.Model):
    id_pagamento = models.AutoField(primary_key=True)
    id_venda = models.ForeignKey(Venda, on_delete=models.CASCADE, db_column='id_venda')
    valor_parcela = models.DecimalField(max_digits=10, decimal_places=2)
    data_vencimento = models.DateField()
    data_pagamento = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20)

    class Meta:
        db_table = 'pagamento'
        managed = False


class Configuracao(models.Model):
    id_configuracao = models.AutoField(primary_key=True)
    taxa_juros = models.DecimalField(max_digits=5, decimal_places=2)
    taxa_multa = models.DecimalField(max_digits=5, decimal_places=2)
    definido_por = models.ForeignKey(Usuario, on_delete=models.CASCADE, db_column='definido_por')

    class Meta:
        db_table = 'configuracao'
        managed = False


class Recebimento(models.Model):
    id_recebimento = models.AutoField(primary_key=True)
    id_pagamento = models.ForeignKey(Pagamento, on_delete=models.CASCADE, db_column='id_pagamento')
    valor_recebido = models.DecimalField(max_digits=10, decimal_places=2)
    valor_juros = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    valor_multa = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    data_pagamento = models.DateField()
    id_usuario = models.ForeignKey(Usuario, null=True, blank=True, on_delete=models.SET_NULL, db_column='id_usuario')

    class Meta:
        db_table = 'recebimento'
        managed = False
