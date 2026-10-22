# Here are your Instructions
# lokalmilitar

## Publicação

O frontend é publicado na Vercel, a API FastAPI no Render e o banco no MongoDB Atlas. O arquivo `render.yaml` configura o serviço da API sem armazenar credenciais no repositório.

### 1. Criar o banco no MongoDB Atlas

1. Crie um cluster e um usuário de banco de dados no Atlas.
2. Configure o acesso de rede do Atlas para permitir conexões da API no Render.
3. Copie a URI de conexão do cluster. Guarde-a como segredo; não a adicione a arquivos do projeto nem a compartilhe em mensagens.

### 2. Publicar a API no Render

1. No Render, crie um **Blueprint** a partir deste repositório e confirme o serviço `lokalmilitar-api` definido em `render.yaml`.
2. Quando solicitado, informe `MONGO_URL` com a URI do Atlas. O Blueprint define `DB_NAME` como `lokalmilitar`, gera `JWT_SECRET` e solicita `CORS_ORIGINS`.
3. Faça o deploy e copie a URL pública da API, por exemplo `https://lokalmilitar-api.onrender.com`.
4. Confirme que a API responde em `https://<URL-DA-API>/docs`.

### 3. Publicar o frontend na Vercel

1. Importe este repositório na Vercel e defina **Root Directory** como `frontend`.
2. Use o preset **Create React App**, o comando de build `yarn build` e o diretório de saída `build`. A Vercel pode detectar essas configurações automaticamente.
3. Em **Settings → Environment Variables**, configure `REACT_APP_BACKEND_URL` com a URL pública da API, sem acrescentar `/api` ao final.
4. Faça o deploy e copie a origem pública do frontend, sem barra final, por exemplo `https://meu-projeto.vercel.app`.

### 4. Restringir o CORS da API

No Render, defina `CORS_ORIGINS` com a origem pública do frontend da Vercel, sem barra no final, e faça um novo deploy da API. Se usar domínios adicionais (como um domínio próprio), inclua cada origem separada por vírgula.

Não publique segredos nem copie valores dos arquivos `.env` locais para o repositório; cadastre-os como variáveis seguras no serviço correspondente. O arquivo `frontend/.env.example` é apenas um exemplo, não uma configuração de produção.
