{
  description = "Ptrckr - Price Tracker Development Environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    agenix-shell.url = "github:aciceri/agenix-shell";
  };

  outputs = { self, nixpkgs, flake-utils, agenix-shell }:
    flake-utils.lib.eachSystem [ "aarch64-darwin" "x86_64-darwin" "x86_64-linux" "aarch64-linux" ] (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        # agenix-shell installation script for secrets
        secretsInstallScript = agenix-shell.lib.installationScript system {
          secrets = {
            NETBARGAINS_API_KEY.file = ./secrets/netbargains_api_key.age;
            FIRECRAWL_API_KEY.file = ./secrets/firecrawl_api_key.age;
          };
        };
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            # Node.js LTS
            nodejs_20

            # Package manager
            pnpm

            # For native modules (better-sqlite3)
            python3
            gcc
            gnumake

            # Useful tools
            just  # Task runner (optional)

            # Secrets management
            age  # Encryption using SSH keys
          ];

          shellHook = ''
            echo "Ptrckr Development Environment"
            echo "Node: $(node --version)"
            echo "pnpm: $(pnpm --version)"
            echo ""

            # Load encrypted secrets via agenix-shell
            echo "Loading encrypted secrets..."
            source ${pkgs.lib.getExe secretsInstallScript}
            echo "Secrets loaded (NETBARGAINS_API_KEY, FIRECRAWL_API_KEY available as env vars)"

            # Check for .env file (for other non-secret config)
            if [ ! -f ".env" ]; then
              echo "Tip: Copy .env.example to .env for non-secret config (DATABASE_URL, etc.)"
            fi

            echo ""
            echo "Run 'pnpm install' to install dependencies"
          '';
        };
      }
    );
}
