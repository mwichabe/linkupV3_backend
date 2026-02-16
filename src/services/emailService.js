const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

// Create transporter
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT),
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Verify transporter
transporter.verify((error) => {
  if (error) {
    logger.warn('Email transporter verification failed (this is expected in development):', error.message);
  } else {
    logger.info('Email transporter is ready');
  }
});

// Send OTP email
exports.sendOTPEmail = async (user, otp) => {
  try {
    // In development, just log the OTP instead of sending email
    if (process.env.NODE_ENV === 'development') {
      logger.info(`[DEV MODE] OTP for ${user.email}: ${otp}`);
      return;
    }

    const mailOptions = {
      from: `${process.env.APP_NAME} <${process.env.EMAIL_FROM}>`,
      to: user.email,
      subject: `Your ${process.env.APP_NAME} Verification Code`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Email Verification</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
              background-color: #f8f9fa;
            }
            .container {
              background: white;
              border-radius: 12px;
              padding: 40px;
              box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
            }
            .logo {
              font-size: 32px;
              font-weight: 800;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
              background-clip: text;
              margin-bottom: 10px;
            }
            .otp-code {
              font-size: 48px;
              font-weight: 700;
              letter-spacing: 8px;
              text-align: center;
              margin: 30px 0;
              padding: 20px;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
              background-clip: text;
              border: 2px solid #e9ecef;
              border-radius: 8px;
            }
            .message {
              text-align: center;
              margin-bottom: 30px;
              color: #6c757d;
            }
            .footer {
              text-align: center;
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #e9ecef;
              color: #6c757d;
              font-size: 14px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">${process.env.APP_NAME}</div>
              <h1>Email Verification</h1>
            </div>
            
            <div class="message">
              <p>Hello ${user.displayName || user.username},</p>
              <p>Thank you for signing up! Use the verification code below to complete your registration:</p>
            </div>
            
            <div class="otp-code">${otp}</div>
            
            <div class="message">
              <p>This code will expire in 10 minutes.</p>
              <p>If you didn't request this code, please ignore this email.</p>
            </div>
            
            <div class="footer">
              <p>© ${new Date().getFullYear()} ${process.env.APP_NAME}. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
    logger.info(`OTP email sent to ${user.email}`);
  } catch (error) {
    logger.error('Error sending OTP email:', error);
    throw error;
  }
};

// Send password reset OTP email
exports.sendPasswordResetOTPEmail = async (user, otp) => {
  try {
    // In development, just log the OTP instead of sending email
    if (process.env.NODE_ENV === 'development') {
      logger.info(`[DEV MODE] Password reset OTP for ${user.email}: ${otp}`);
      return;
    }

    const mailOptions = {
      from: `${process.env.APP_NAME} <${process.env.EMAIL_FROM}>`,
      to: user.email,
      subject: `Reset your ${process.env.APP_NAME} password`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Password Reset</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
              background-color: #f8f9fa;
            }
            .container {
              background: white;
              border-radius: 12px;
              padding: 40px;
              box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
            }
            .logo {
              font-size: 32px;
              font-weight: 800;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
              background-clip: text;
              margin-bottom: 10px;
            }
            .otp-code {
              font-size: 48px;
              font-weight: 700;
              letter-spacing: 8px;
              text-align: center;
              margin: 30px 0;
              padding: 20px;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
              background-clip: text;
              border: 2px solid #e9ecef;
              border-radius: 8px;
            }
            .message {
              text-align: center;
              margin-bottom: 30px;
              color: #6c757d;
            }
            .footer {
              text-align: center;
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #e9ecef;
              color: #6c757d;
              font-size: 14px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">${process.env.APP_NAME}</div>
              <h1>Password Reset</h1>
            </div>
            
            <div class="message">
              <p>Hello ${user.displayName || user.username},</p>
              <p>We received a request to reset your password. Use the verification code below:</p>
            </div>
            
            <div class="otp-code">${otp}</div>
            
            <div class="message">
              <p>This code will expire in 10 minutes.</p>
              <p>If you didn't request this code, please ignore this email.</p>
            </div>
            
            <div class="footer">
              <p>© ${new Date().getFullYear()} ${process.env.APP_NAME}. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
    logger.info(`Password reset OTP email sent to ${user.email}`);
  } catch (error) {
    logger.error('Error sending password reset OTP email:', error);
    throw error;
  }
};
