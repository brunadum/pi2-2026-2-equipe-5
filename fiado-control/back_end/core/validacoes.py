"""Validações de entrada da API, sem consultas ou alterações no banco."""

from datetime import date
import re


def campos_ausentes(dados, campos):
    return [campo for campo in campos
            if dados.get(campo) in (None, '', [])
            or isinstance(dados.get(campo), str) and not dados[campo].strip()]


def normalizar_cpf(valor):
    if not isinstance(valor, str):
        return None
    valor = valor.strip()
    if not re.fullmatch(r'(?:[0-9]{11}|[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2})', valor):
        return None
    return re.sub(r'[^0-9]', '', valor)


def cpf_valido(cpf):
    if len(cpf) != 11 or len(set(cpf)) == 1:
        return False
    for tamanho in (9, 10):
        soma = sum(int(cpf[i]) * (tamanho + 1 - i) for i in range(tamanho))
        digito = (soma * 10) % 11
        if int(cpf[tamanho]) != (0 if digito == 10 else digito):
            return False
    return True


def normalizar_telefone(valor):
    if not isinstance(valor, str) or len(valor) > 30:
        return None
    # DDD, fixo de oito dígitos (2–5) ou celular de nove (9), DDI 55 opcional.
    padrao = r'(?:\+?55[ .-]?)?(?:\(([1-9][0-9])\)|([1-9][0-9]))[ .-]?((?:9[0-9]{4}|[2-5][0-9]{3}))[ .-]?([0-9]{4})'
    resultado = re.fullmatch(padrao, valor.strip())
    if resultado is None:
        return None
    ddd_com_parenteses, ddd, inicio, fim = resultado.groups()
    return (ddd_com_parenteses or ddd) + inicio + fim


def data_iso(valor):
    if not isinstance(valor, str):
        raise ValueError('Data deve ser texto no formato AAAA-MM-DD')
    resultado = date.fromisoformat(valor)
    if resultado.isoformat() != valor:
        raise ValueError('Data deve estar no formato AAAA-MM-DD')
    return resultado


def filtro_cpf(valor):
    if not re.fullmatch(r'[0-9.-]+', valor):
        return None
    digitos = re.sub(r'[^0-9]', '', valor)
    return digitos if 1 <= len(digitos) <= 11 else None


def filtro_telefone(valor):
    if not re.fullmatch(r'[+0-9(). -]+', valor):
        return None
    digitos = re.sub(r'[^0-9]', '', valor)
    if len(digitos) in (12, 13) and digitos.startswith('55'):
        digitos = digitos[2:]
    return digitos if 1 <= len(digitos) <= 11 else None
