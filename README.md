# conta-em-dia-controle-financeiro

## Acesso

- Cada pessoa cria o próprio acesso (e-mail + senha) no primeiro uso.
- A senha nunca é salva. Ela gera uma chave (PBKDF2, 310 mil iterações) que cifra os lançamentos com AES-256-GCM no `localStorage`.
- Cada conta tem seus dados separados e cifrados: uma pessoa não vê os dados da outra, mesmo no mesmo aparelho.
- Após 5 senhas erradas, o login fica bloqueado por 60 segundos.
- A senha não pode ser recuperada. Use "Baixar backup" para guardar uma cópia dos lançamentos.
- Os dados ficam só no aparelho/navegador onde foram cadastrados (não sincroniza entre aparelhos).
- Publique em endereço `https` (ex.: GitHub Pages) para a criptografia do navegador funcionar.
