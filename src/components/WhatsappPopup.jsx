import React, { useState, useEffect } from 'react';
import { X, MessageCircle } from 'lucide-react';

const WhatsappPopup = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const lastShownTime = localStorage.getItem('whatsapp_popup_last_shown');
    const threeHoursInMs = 3 * 60 * 60 * 1000;
    const now = Date.now();

    if (!lastShownTime || (now - parseInt(lastShownTime, 10)) > threeHoursInMs) {
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, 3000); // Aparece após 3 segundos
      return () => clearTimeout(timer);
    }
  }, []);

  const handleClose = () => {
    setIsVisible(false);
    localStorage.setItem('whatsapp_popup_last_shown', Date.now().toString());
  };

  const handleJoin = () => {
    setIsVisible(false);
    localStorage.setItem('whatsapp_popup_last_shown', Date.now().toString());
    window.open('https://whatsapp.com/channel/0029VbDGmNYCnA7zUGZ1CF2G', '_blank');
  };

  if (!isVisible) return null;

  return (
    <div className="whatsapp-popup-overlay">
      <div className="whatsapp-popup-box">
        <button className="whatsapp-popup-close" onClick={handleClose}>
          <X size={20} />
        </button>
        <div className="whatsapp-popup-header">
          <div className="whatsapp-icon-wrap">
            <img src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg" alt="WhatsApp" className="wapp-icon" />
          </div>
          <h3>Canal Oficial do site!</h3>
        </div>
        <p className="whatsapp-popup-desc">
          Quer ser avisado sempre que sair um filme ou episódio novo? 
          Entre no nosso canal oficial do WhatsApp e não perca nada do CineGeek!
        </p>
        <button className="whatsapp-popup-btn" onClick={handleJoin}>
          SEGUIR AGORA
        </button>
      </div>
    </div>
  );
};

export default WhatsappPopup;
