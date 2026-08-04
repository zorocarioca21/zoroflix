import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

// ==========================================
// CONFIGURAÇÃO DO TRANSPORTER
// ==========================================
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false, // TLS
    auth: {
        user: process.env.SMTP_USER || 'lucaspereirarjcontato@gmail.com',
        pass: process.env.SMTP_PASS || 'hbnq fmia svnq mtkf',
    },
    tls: {
        rejectUnauthorized: false
    }
});

// ==========================================
// TEMPLATE BASE (HTML) CINEGEEK
// ==========================================
function baseTemplate(conteudo) {
    return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { background-color: #0b0c10; font-family: 'Arial', sans-serif; color: #c5c6c7; }
            .wrapper { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
            .card {
                background: linear-gradient(135deg, #111118, #1a1a2e);
                border: 1px solid rgba(0, 255, 136, 0.2);
                border-radius: 16px;
                overflow: hidden;
            }
            .header {
                background: linear-gradient(135deg, #00ff88 0%, #00b368 100%);
                padding: 30px;
                text-align: center;
            }
            .header h1 {
                color: #0b0c10;
                font-size: 28px;
                font-weight: 900;
                letter-spacing: 2px;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 10px;
            }
            .header p { color: #0b0c10; opacity: 0.8; margin-top: 5px; font-size: 13px; font-weight: bold; }
            .body { padding: 40px 35px; }
            .body h2 { color: #00ff88; font-size: 20px; margin-bottom: 15px; }
            .body p { color: #d1d1d6; line-height: 1.7; margin-bottom: 15px; font-size: 15px; }
            .body strong { color: #ffffff; }
            .btn {
                display: inline-block;
                background: linear-gradient(135deg, #00ff88, #00b368);
                color: #0b0c10 !important;
                font-weight: 900;
                font-size: 16px;
                padding: 14px 35px;
                border-radius: 10px;
                text-decoration: none;
                margin: 20px 0;
                letter-spacing: 1px;
                box-shadow: 0 4px 15px rgba(0, 255, 136, 0.4);
            }
            .info-box {
                background: rgba(0, 255, 136, 0.05);
                border: 1px solid rgba(0, 255, 136, 0.2);
                border-radius: 10px;
                padding: 15px 20px;
                margin: 20px 0;
                font-size: 13px;
                color: #9ba0a3;
            }
            .footer {
                text-align: center;
                padding: 20px 35px;
                border-top: 1px solid rgba(255,255,255,0.05);
                color: #555;
                font-size: 12px;
            }
            .footer a { color: #00ff88; text-decoration: none; }
        </style>
    </head>
    <body>
        <div class="wrapper">
            <div class="card">
                <div class="header">
                    <h1>CINEGEEK</h1>
                    <p>Sua Plataforma Premium de Streaming</p>
                </div>
                <div class="body">
                    ${conteudo}
                </div>
                <div class="footer">
                    <p>Este email foi enviado automaticamente. Não responda.</p>
                    <p style="margin-top:8px;">© ${new Date().getFullYear()} CineGeek — Todos os direitos reservados.</p>
                </div>
            </div>
        </div>
    </body>
    </html>
    `;
}

// ==========================================
// 1. EMAIL DE REDEFINIÇÃO DE SENHA
// ==========================================
export async function enviarResetSenha(email, usuario, token) {
    const link = `https://cinegeek.shop/redefinir-senha?token=${token}`;

    const html = baseTemplate(`
        <h2>Redefinição de Senha 🔑</h2>
        <p>Olá, <strong>${usuario}</strong>! Recebemos uma solicitação para redefinir a senha da sua conta no <strong>CineGeek</strong>.</p>
        <p>Clique no botão abaixo para criar uma nova senha:</p>
        <div style="text-align: center;">
            <a href="${link}" class="btn">🔑 Redefinir minha Senha</a>
        </div>
        <div class="info-box">
            ⚠️ Este link expira em <strong>1 hora</strong>. Após isso, será necessário solicitar novamente.<br><br>
            Se você <strong>não</strong> solicitou a redefinição de senha, ignore este email. Sua senha permanece a mesma por segurança.
        </div>
        <p style="font-size: 13px; color: #9ba0a3;">Se o botão não funcionar, copie e cole este link no seu navegador:</p>
        <p style="font-size: 12px; color: #00ff88; word-break: break-all;">${link}</p>
    `);

    await transporter.sendMail({
        from: process.env.EMAIL_FROM || '"CineGeek" <lucaspereirarjcontato@gmail.com>',
        to: email,
        subject: '🔑 CineGeek — Redefinição de senha solicitada',
        html
    });
}
