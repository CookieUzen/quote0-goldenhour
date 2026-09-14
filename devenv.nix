{ pkgs, lib, config, inputs, ... }:

{
  # https://devenv.sh/basics/
  cachix.enable = false;

  # https://devenv.sh/packages/
  packages = [
    pkgs.git
    pkgs.dejavu_fonts
  ];

  # https://devenv.sh/languages/
  languages.typescript.enable = true;
  languages.javascript = {
    enable = true;
    npm.enable = true;
    npm.install.enable = true;
  };

  # Fonts for the 1-bit card renderer (Skia on NixOS needs an explicit path).
  env.CARD_FONT = "${pkgs.dejavu_fonts}/share/fonts/truetype/DejaVuSans.ttf";
  env.CARD_FONT_BOLD = "${pkgs.dejavu_fonts}/share/fonts/truetype/DejaVuSans-Bold.ttf";

  # Where rendered cards are written.
  env.OUT_DIR = "out";

  enterShell = ''
    echo "Quote/0 golden-hour card — node $(node --version)"
    echo "render:  npm run dev        (or FRAMES=4 npm run dev for an animated set)"
  '';

  # See full reference at https://devenv.sh/reference/options/
}