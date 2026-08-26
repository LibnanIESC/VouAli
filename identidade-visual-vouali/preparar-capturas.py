"""
Prepara as capturas do celular para a ficha da Play Store.

Duas coisas precisam ser feitas, e nenhuma é enfeite:

1. PROPORÇÃO. O aparelho entrega 1220x2712, ou seja 2,223:1, e a Play Store
   aceita no máximo 2:1. Cortar as barras do sistema (a de status em cima e a
   de navegação embaixo) resolve a proporção E deixa a imagem mais limpa —
   ninguém quer ver a bateria de outra pessoa numa loja.

2. O E-MAIL. A tela de viagens mostra a conta logada no rodapé. Isso é dado
   pessoal indo para uma página pública, então some — pintado com a cor de
   fundo da própria tela, sem inventar um e-mail que não existe.
"""
from pathlib import Path
from PIL import Image

AQUI = Path(__file__).parent
ORIGEM = AQUI / "caps"
DESTINO = Path(r"C:\Users\Administrador\Projetos\VouAli\loja\capturas")

# Medidas conferidas nesta captura de 1220x2712.
BARRA_DE_STATUS = 100
BARRA_DE_NAVEGACAO = 172        # 100 + 172 = 272, e 2712 - 272 = 2440 = 1220 x 2
CREME = (251, 244, 233)

TELAS = [
    ("15-12-49", "1-minhas-viagens", True),   # o rodapé com o e-mail está aqui
    ("15-13-37", "2-roteiro", False),
    ("15-14-19", "3-orcamento", False),
    ("15-15-26", "4-ali", False),
    ("15-15-53", "5-comprar-antes", False),
]


def main():
    DESTINO.mkdir(parents=True, exist_ok=True)
    for marca, nome, tem_email in TELAS:
        origem = next(ORIGEM.glob(f"*{marca}*.jpg"))
        im = Image.open(origem).convert("RGB")

        if tem_email:
            # Cobre a linha inteira do rodapé com o fundo da tela.
            im.paste(Image.new("RGB", (im.width, 96), CREME), (0, 2390))

        alta = im.height - BARRA_DE_STATUS - BARRA_DE_NAVEGACAO
        im = im.crop((0, BARRA_DE_STATUS, im.width, BARRA_DE_STATUS + alta))
        saida = DESTINO / f"{nome}.png"
        im.save(saida)
        print(f"  {saida.name}: {im.width}x{im.height} "
              f"(proporção {im.height / im.width:.3f}) {saida.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
