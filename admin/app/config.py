"""
Configuração do painel, lida do ambiente.

No Railway, as variáveis ficam no serviço. Localmente, num .env — veja
.env.example. Nada de segredo versionado.
"""

import os

from dotenv import load_dotenv

load_dotenv()


class Settings:
    # Estágio 1 do login. Sem ela, o painel responde 503.
    ADMIN_PASSWORD: str = os.getenv("ADMIN_PASSWORD", "")

    # Segredo DEDICADO que assina o cookie de sessão — separado de qualquer
    # outro segredo do projeto. Sem ele o painel também responde 503.
    ADMIN_SESSION_SECRET: str = os.getenv("ADMIN_SESSION_SECRET", "")

    # Mesmo Postgres do backend. No Railway, referência de variável.
    DATABASE_URL: str = os.getenv("DATABASE_URL", "")

    ENV: str = os.getenv("ADMIN_ENV", "production")

    TOTP_ISSUER: str = os.getenv("TOTP_ISSUER", "VouAli Admin")

    RATE_LIMIT_MAX_FAILS: int = int(os.getenv("RATE_LIMIT_MAX_FAILS", "5"))
    RATE_LIMIT_WINDOW_MIN: int = int(os.getenv("RATE_LIMIT_WINDOW_MIN", "15"))

    # Só para estimar o custo na tela de Custo — não faz chamada de IA nenhuma.
    ALI_MODEL: str = os.getenv("ALI_MODEL", "claude-sonnet-5")

    @property
    def IS_PRODUCTION(self) -> bool:
        return self.ENV.strip().lower() == "production"

    @property
    def HABILITADO(self) -> bool:
        """Fail-closed: falta senha ou segredo, o painel não abre."""
        return bool(self.ADMIN_PASSWORD and self.ADMIN_SESSION_SECRET)


settings = Settings()
