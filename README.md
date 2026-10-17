# Here are your Instructions
# lokalmilitar

## Publicação na Vercel

O frontend pode ser publicado como um projeto separado na Vercel:

1. Importe este repositório na Vercel e defina **Root Directory** como `frontend`.
2. Use o preset **Create React App**, o comando de build `yarn build` e o diretório de saída `build`. A Vercel pode detectar essas configurações automaticamente.
3. Em **Settings → Environment Variables**, configure `REACT_APP_BACKEND_URL` com a URL pública da API, sem acrescentar `/api` ao final. Por exemplo: `https://minha-api.example.com`.
4. Faça um novo deploy depois de salvar a variável. O Create React App incorpora essa configuração durante o build.

O arquivo `frontend/vercel.json` encaminha rotas do cliente, como `/login`, para o app React, permitindo abrir e atualizar essas páginas diretamente.

### API e banco de dados

A Vercel publicará o frontend; a API FastAPI deste repositório e o MongoDB precisam estar acessíveis em serviços de backend e banco de dados. Configure no serviço da API as variáveis `MONGO_URL`, `DB_NAME` e `JWT_SECRET`. Configure também `CORS_ORIGINS` com a origem pública do frontend na Vercel, por exemplo `https://meu-projeto.vercel.app`, sem barra no final. Não publique segredos nem copie valores do arquivo `.env` local para o repositório; cadastre-os como variáveis seguras no serviço correspondente.

O arquivo `frontend/.env.example` mostra o formato esperado para a URL da API. Ele é apenas um exemplo; os valores de produção devem ser cadastrados nas configurações da Vercel.
