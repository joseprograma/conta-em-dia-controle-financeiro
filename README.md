# conta-em-dia-controle-financeiro

## Acesso

- Cada pessoa cria o próprio acesso (e-mail + senha) e entra com ele em qualquer aparelho (celular e computador).
- O login e os dados ficam no Firebase (Authentication + Firestore), no documento `cofres/{uid}` de cada pessoa.
- A senha digitada nunca sai do aparelho:
  - o Firebase recebe só uma senha derivada (PBKDF2), usada para o login;
  - os lançamentos são compactados e cifrados com AES-256-GCM, com uma chave derivada da senha (PBKDF2, 310 mil iterações), antes de ir para o servidor.
- As regras em `firestore.rules` só deixam cada pessoa ler e gravar o próprio cofre, e a versão sobe de 1 em 1 para um aparelho não apagar o que o outro gravou.
- A senha não pode ser recuperada: sem ela, ninguém abre os dados. Use "Baixar backup" com frequência.
- Contas da versão antiga (salvas só no navegador) sobem para o servidor no primeiro login com o mesmo e-mail e senha.

## Configuração do Firebase

1. Crie um projeto no Firebase.
2. Authentication > Método de login > ative **E-mail/senha**.
3. Firestore Database > criar banco em **modo de produção** > aba Regras > cole o conteúdo de `firestore.rules` e publique.
4. Configurações do projeto > Seus apps > app **Web** > copie `apiKey`, `authDomain`, `projectId` e `appId` para `config.js`.
