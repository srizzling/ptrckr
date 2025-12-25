{
  description = "Ptrckr - Price Tracker Development Environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachSystem [ "aarch64-darwin" "x86_64-darwin" "x86_64-linux" "aarch64-linux" ] (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
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
          ];

          shellHook = ''
            echo "Ptrckr Development Environment"
            echo "Node: $(node --version)"
            echo "pnpm: $(pnpm --version)"
            echo ""
            echo "Run 'pnpm install' to install dependencies"
          '';
        };
      }
    );
}
