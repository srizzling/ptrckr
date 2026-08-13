{ pkgs, lib, config, inputs, ... }:

let
  # Encrypted secrets, decrypted into env vars on shell entry.
  secretsInstallScript = inputs.agenix-shell.lib.installationScript pkgs.stdenv.hostPlatform.system {
    secrets = {
      NETBARGAINS_API_KEY.file = ./secrets/netbargains_api_key.age;
      FIRECRAWL_API_KEY.file = ./secrets/firecrawl_api_key.age;
    };
  };
in
{
  # Was nodejs_20 under the old flake; nixpkgs removed it after Node 20 went
  # end-of-life on 2026-04-30. 22 is the smallest supported step up.
  languages.javascript = {
    enable = true;
    package = pkgs.nodejs_22;
    pnpm.enable = true;
  };

  # The app reads .env itself, as it did under the flake devShell. Not enabling
  # devenv's dotenv integration keeps that behaviour identical; this only
  # silences the hint.
  dotenv.disableHint = true;

  packages = with pkgs; [
    # For native modules (better-sqlite3)
    python3
    gcc
    gnumake

    # Useful tools
    just # Task runner (optional)

    # Secrets management
    age # Encryption using SSH keys
  ];

  enterShell = ''
    echo "Ptrckr Development Environment"
    echo "Node: $(node --version)"
    echo "pnpm: $(pnpm --version)"
    echo ""

    # Load encrypted secrets via agenix-shell
    echo "Loading encrypted secrets..."
    source ${lib.getExe secretsInstallScript}
    echo "Secrets loaded (NETBARGAINS_API_KEY, FIRECRAWL_API_KEY available as env vars)"

    # Check for .env file (for other non-secret config)
    if [ ! -f ".env" ]; then
      echo "Tip: Copy .env.example to .env for non-secret config (DATABASE_URL, etc.)"
    fi

    echo ""
    echo "Run 'pnpm install' to install dependencies"
  '';
}
