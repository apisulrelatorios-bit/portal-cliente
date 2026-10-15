-- Nomes de exibição dos módulos (o slug continua gr / gl).
update public.templates
set estrutura = jsonb_set(
      jsonb_set(estrutura, '{modulos,0,nome}', '"Gerenciamento de Risco"'),
      '{modulos,1,nome}', '"Gestão Logística"')
where slug = 'padrao-apisul';

update public.modulos set nome = 'Gerenciamento de Risco' where slug = 'gr' and nome = 'GR';
update public.modulos set nome = 'Gestão Logística'       where slug = 'gl' and nome = 'GL';
