{
  description = "Chrome Extension with OXC + Vite + CRXJS";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
        };
      in {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs_22
            pnpm_10
            nushell
           just
           typescript
           oxlint
           oxfmt
           chromium
           playwright-driver.browsers
         ];

          env = {
            PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}";
          };

          shellHook = ''
            export PATH="$PWD/node_modules/.bin:$PATH"

            echo "Chrome Extension Dev Environment"

            if [ ! -d node_modules ]; then
              pnpm install
            fi

            case $- in
              *i*) exec ${pkgs.nushell}/bin/nu ;;
            esac
          '';
        };
      });
}
