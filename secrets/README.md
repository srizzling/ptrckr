# Secrets Management

This directory contains encrypted secrets for the ptrckr project using [agenix-shell](https://github.com/aciceri/agenix-shell) with [age](https://github.com/FiloSottile/age) encryption.

## How It Works

When you enter the nix development shell (`nix develop`), agenix-shell automatically:
1. Decrypts secrets using your SSH key (`~/.ssh/id_ed25519`)
2. Stores them securely in `~/.agenix-shell/` (tmpfs on Linux)
3. Exports them as environment variables

## Current Secrets

| Secret | Environment Variable |
|--------|---------------------|
| `netbargains_api_key.age` | `$NETBARGAINS_API_KEY` |
| `firecrawl_api_key.age` | `$FIRECRAWL_API_KEY` |

## Adding More Secrets

1. Encrypt the new secret using `nix shell`:
   ```bash
   nix shell nixpkgs#age -c bash -c \
     "echo 'secret_value' | age -R ~/.ssh/id_ed25519.pub -o secrets/my_secret.age"
   ```

2. Add to `flake.nix` in the `secrets` block:
   ```nix
   secrets = {
     NETBARGAINS_API_KEY.file = ./secrets/netbargains_api_key.age;
     MY_SECRET.file = ./secrets/my_secret.age;  # Add this
   };
   ```

3. Stage the file for git: `git add secrets/my_secret.age`

4. Re-enter the shell to load the new secret: `exit && nix develop`

## Decrypting Manually

```bash
nix shell nixpkgs#age -c age -d -i ~/.ssh/id_ed25519 secrets/netbargains_api_key.age
```
