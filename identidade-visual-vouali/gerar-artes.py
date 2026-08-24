"""
Gera as imagens do app a partir da arte em project/assets/.

Rode de dentro de identidade-visual-vouali/:   python gerar-artes.py

    icone_app.jfif   -> ícones do Android (adaptativo + legado), da web e do PWA
    fundo_viagem.jfif -> ilustração das boas-vindas
    (composto)       -> telas de abertura do Android

Por que um script e não arquivos soltos: são mais de 30 imagens em 5
densidades, e refazê-las na mão quando a arte mudar é convite a erro. Aqui a
arte é a fonte única — mexeu nela, roda de novo.

O ponto delicado é o ícone adaptativo do Android. O sistema recorta o ícone
com a máscara que o fabricante escolher (círculo, quadrado arredondado,
gota…), e só o miolo — 72 de 108 unidades, 66,7% — tem garantia de aparecer.
Entregar a arte inteira nesse espaço faz o avião e a seta serem cortados na
metade dos aparelhos. Por isso o logo é separado do fundo e reduzido: o fundo
sangra até a borda, o logo fica no miolo seguro.
"""
from pathlib import Path
from PIL import Image, ImageDraw
import numpy as np

AQUI = Path(__file__).parent
ARTE = AQUI / "project" / "assets" / "icone_app.jfif"
FUNDO = AQUI / "project" / "assets" / "fundo_viagem.jfif"
ANDROID = AQUI.parent / "frontend" / "android" / "app" / "src" / "main" / "res"
WEB = AQUI.parent / "frontend" / "public"

CREME = (251, 244, 233)   # o fundo do app, igual em todas as telas de abertura

# Navy da arte, medido nela: mais claro em cima e no meio, escuro nas bordas.
CLARO = (8, 60, 140)
ESCURO = (4, 28, 84)
FOCO = (0.50, 0.38)     # onde o brilho é mais forte

# Onde o sistema recorta, o que sobra garantido é o CÍRCULO de 72 das 108
# unidades do ícone. Não basta a largura do logo caber nesses 66,7%: o que
# tem de caber é a DIAGONAL da caixa dele, senão os cantos passam do círculo —
# foi assim que o avião (canto superior direito) e a seta (borda direita)
# apareceram cortados. A largura máxima sai da proporção do próprio logo, e
# não de um número escolhido a olho, para não errar de novo se a arte mudar.
MIOLO = 72 / 108
FOLGA = 0.94            # fabricantes que recortam um pouco além do padrão
LOGO_INTEIRO = 0.85     # onde a arte aparece como foi desenhada, sem máscara

# 108dp de tela em cada densidade
DENSIDADES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}


def recortar_logo():
    """Separa o logo do fundo navy, devolvendo RGBA com fundo transparente."""
    im = Image.open(ARTE).convert("RGB")
    rgb = np.asarray(im).astype(float)
    lum = rgb @ [0.299, 0.587, 0.114]
    H, W = lum.shape

    # A forma navy é convexa: em cada linha vai do primeiro ao último escuro.
    escuro = lum < 120
    forma = np.zeros_like(escuro)
    for y in range(H):
        xs = np.where(escuro[y])[0]
        if len(xs) > 20:
            forma[y, xs.min():xs.max() + 1] = True

    # A arte tem um brilho na borda interna do quadrado que chega ao mesmo
    # tom do logo. Recortar a caixa do logo ANTES resolve: lá dentro o navy
    # não passa de 60 de brilho, e a separação fica limpa.
    nucleo = (lum > 170) & forma
    ys, xs = np.where(nucleo)
    m = 6
    caixa = (max(xs.min() - m, 0), max(ys.min() - m, 0),
             min(xs.max() + 1 + m, W), min(ys.max() + 1 + m, H))
    rgb = rgb[caixa[1]:caixa[3], caixa[0]:caixa[2]]
    lum = lum[caixa[1]:caixa[3], caixa[0]:caixa[2]]

    # O logo é claro; o navy, escuro. A rampa preserva as bordas suavizadas.
    a = np.clip((lum - 62.0) / 88.0, 0, 1)

    # Nas bordas o pixel é mistura de logo e navy. Desfazer a mistura evita a
    # franja escura que aparece quando se recorta pelo brilho e mais nada.
    fundo = np.array([5, 41, 103], dtype=float)
    with np.errstate(divide="ignore", invalid="ignore"):
        cor = (rgb - (1 - a)[..., None] * fundo) / np.maximum(a, 1e-6)[..., None]
    cor = np.clip(np.where(a[..., None] > 0.01, cor, 0), 0, 255)

    out = np.dstack([cor, a * 255]).astype(np.uint8)
    img = Image.fromarray(out, "RGBA")
    return img.crop(img.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox())


def fundo_navy(lado):
    """O degradê navy da arte, em qualquer tamanho."""
    y, x = np.mgrid[0:lado, 0:lado] / max(lado - 1, 1)
    d = np.sqrt((x - FOCO[0]) ** 2 + (y - FOCO[1]) ** 2)
    t = np.clip(d / 0.78, 0, 1)[..., None]
    cor = np.array(CLARO) * (1 - t) + np.array(ESCURO) * t
    return Image.fromarray(cor.astype(np.uint8), "RGB").convert("RGBA")


def compor(logo, lado, largura_do_logo, fundo=True, centro_y=0.5):
    """Fundo navy (ou nada) com o logo centrado, na largura pedida."""
    base = fundo_navy(lado) if fundo else Image.new("RGBA", (lado, lado), (0, 0, 0, 0))
    w = round(lado * largura_do_logo)
    h = round(w * logo.height / logo.width)
    peca = logo.resize((w, h), Image.LANCZOS)
    base.alpha_composite(peca, ((lado - w) // 2, round(lado * centro_y - h / 2)))
    return base


def arredondar(img, raio=0.22):
    """Aplica os cantos arredondados da arte (para onde o sistema não mascara)."""
    lado = img.width
    m = Image.new("L", (lado * 4, lado * 4), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, lado * 4 - 1, lado * 4 - 1],
                                        radius=round(lado * 4 * raio), fill=255)
    img = img.copy()
    img.putalpha(m.resize((lado, lado), Image.LANCZOS))
    return img


def circular(img):
    lado = img.width
    m = Image.new("L", (lado * 4, lado * 4), 0)
    ImageDraw.Draw(m).ellipse([0, 0, lado * 4 - 1, lado * 4 - 1], fill=255)
    img = img.copy()
    img.putalpha(m.resize((lado, lado), Image.LANCZOS))
    return img


def largura_segura(logo):
    """Maior largura em que a caixa do logo cabe inteira no miolo circular."""
    diagonal = (logo.width ** 2 + logo.height ** 2) ** 0.5
    return MIOLO * logo.width / diagonal * FOLGA


def main():
    logo = recortar_logo()
    mascarado = largura_segura(logo)
    print(f"logo recortado: {logo.width}x{logo.height} (proporção {logo.width/logo.height:.2f})")
    print(f"largura no miolo circular: {mascarado:.1%} — nada de corte")

    # ---------- Android: ícone adaptativo ----------
    # Fundo e logo em camadas separadas, cada uma sangrando 108dp.
    for nome, escala in DENSIDADES.items():
        lado = round(108 * escala)
        pasta = ANDROID / f"mipmap-{nome}"
        pasta.mkdir(parents=True, exist_ok=True)
        fundo_navy(lado).convert("RGB").save(pasta / "ic_launcher_background.png")
        compor(logo, lado, mascarado, fundo=False).save(pasta / "ic_launcher_foreground.png")

        # Aparelhos antigos (antes do Android 8) não têm ícone adaptativo:
        # recebem a arte já composta e já arredondada.
        legado = round(48 * escala)
        cheio = compor(logo, legado, mascarado)
        arredondar(cheio).save(pasta / "ic_launcher.png")
        circular(cheio).save(pasta / "ic_launcher_round.png")
        print(f"  {nome}: adaptativo {lado}px, legado {legado}px")

    # ---------- Web e PWA ----------
    WEB.mkdir(parents=True, exist_ok=True)
    # "any": a arte como foi desenhada, com os cantos vazados em vez de brancos.
    for lado in (192, 512):
        arredondar(compor(logo, lado, LOGO_INTEIRO)).save(WEB / f"icon-{lado}.png")
    # "maskable" e iOS: o sistema recorta, então o navy sangra e o logo encolhe.
    compor(logo, 512, mascarado).convert("RGB").save(WEB / "icon-512-maskable.png")
    compor(logo, 180, mascarado).convert("RGB").save(WEB / "icon-180.png")
    print("  web: icon-192, icon-512, icon-512-maskable, icon-180")

    # ---------- Ícone da abertura (Android 12+) ----------
    # O sistema NÃO usa a imagem de splash: ele desenha um selo redondo com o
    # ícone do app. E se receber o ícone adaptativo, ainda amplia em 1,5× — foi
    # o que espremeu a palavra contra a borda. Um desenho próprio evita isso:
    # só o logo, sobre nada, no mesmo tamanho relativo do ícone do launcher.
    (ANDROID / "drawable").mkdir(parents=True, exist_ok=True)
    compor(logo, 960, mascarado, fundo=False).save(ANDROID / "drawable" / "splash_icon.png")
    print("  abertura: splash_icon.png (logo sobre o selo navy do sistema)")

    # ---------- Telas de abertura do Android ----------
    # Creme com o ícone no meio — o mesmo creme com que o app abre. A abertura
    # inteira fica de uma cor só: sem piscada entre a tela do sistema, a do
    # Capacitor e a do próprio app.
    selo = arredondar(compor(logo, 1024, mascarado))
    for pasta in sorted(ANDROID.glob("drawable*")):
        alvo = pasta / "splash.png"
        if not alvo.exists():
            continue
        tela = Image.open(alvo).size
        canvas = Image.new("RGBA", tela, CREME + (255,))
        d = round(min(tela) * 0.30)
        canvas.alpha_composite(selo.resize((d, d), Image.LANCZOS),
                               ((tela[0] - d) // 2, (tela[1] - d) // 2))
        canvas.convert("RGB").save(alvo)
    print(f"  abertura: {len(list(ANDROID.glob('drawable*/splash.png')))} telas em creme")

    # ---------- Ilustração das boas-vindas ----------
    # 768px de largura cobre telas 3x sem exagero. Só a interface do app usa,
    # e só numa tela — não vale carregar 2 MB para isso.
    ilus = Image.open(FUNDO).convert("RGB")
    larg = 768
    ilus = ilus.resize((larg, round(larg * ilus.height / ilus.width)), Image.LANCZOS)
    ilus.save(WEB / "boas-vindas.jpg", quality=78, optimize=True, progressive=True)
    kb = (WEB / "boas-vindas.jpg").stat().st_size / 1024
    print(f"  boas-vindas.jpg: {ilus.width}x{ilus.height}, {kb:.0f} KB")


if __name__ == "__main__":
    main()
