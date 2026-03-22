import ssl
from typing import Optional

import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from app.core.security import decrypt_password
from app.models import SMTPConfig


async def send_email(
    smtp_config: SMTPConfig,
    to_email: str,
    subject: str,
    body: str,
    html_body: Optional[str] = None,
) -> None:
    password = decrypt_password(smtp_config.password_encrypted)

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{smtp_config.from_name} <{smtp_config.from_email}>"
    msg["To"] = to_email

    msg.attach(MIMEText(body, "plain", "utf-8"))
    if html_body:
        msg.attach(MIMEText(html_body, "html", "utf-8"))

    tls_context = ssl.create_default_context() if smtp_config.use_tls else None

    await aiosmtplib.send(
        msg,
        hostname=smtp_config.host,
        port=smtp_config.port,
        username=smtp_config.username,
        password=password,
        use_tls=smtp_config.use_ssl,
        start_tls=smtp_config.use_tls,
        tls_context=tls_context,
    )


def render_template(template: str, variables: dict) -> str:
    result = template
    for key, value in variables.items():
        result = result.replace(f"{{{{{key}}}}}", str(value))
    return result


async def send_password_reset_email(
    smtp_config: SMTPConfig,
    to_email: str,
    reset_url: str,
    app_name: str = "Klyp",
) -> None:
    subject = f"Recuperación de contraseña - {app_name}"
    body = (
        f"Hola,\n\n"
        f"Recibimos una solicitud para restablecer tu contraseña en {app_name}.\n\n"
        f"Haz clic en el siguiente enlace para crear una nueva contraseña (válido 1 hora):\n\n"
        f"{reset_url}\n\n"
        f"Si no solicitaste este cambio, ignora este correo.\n\n"
        f"Saludos,\nEl equipo de {app_name}"
    )
    await send_email(smtp_config, to_email, subject, body)


async def send_workspace_invite_email(
    smtp_config: SMTPConfig,
    to_email: str,
    workspace_name: str,
    invited_by_name: str,
    invite_url: str,
    rol: str,
    app_name: str = "Klyp",
) -> None:
    subject = f"Invitación a workspace '{workspace_name}' - {app_name}"
    body = (
        f"Hola,\n\n"
        f"{invited_by_name} te ha invitado a unirte al workspace '{workspace_name}' "
        f"en {app_name} con el rol de '{rol}'.\n\n"
        f"Acepta la invitación aquí:\n\n"
        f"{invite_url}\n\n"
        f"La invitación expira en 7 días.\n\n"
        f"Saludos,\nEl equipo de {app_name}"
    )
    await send_email(smtp_config, to_email, subject, body)
