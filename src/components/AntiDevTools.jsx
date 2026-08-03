import React, { useEffect } from 'react';

export default function AntiDevTools() {
    useEffect(() => {
        const preventContext = (e) => e.preventDefault();
        
        const preventKeys = (e) => {
            if (
                e.keyCode === 123 || 
                (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67)) || 
                (e.ctrlKey && e.keyCode === 85)
            ) {
                e.preventDefault();
                window.location.reload();
                return false;
            }
        };

        const freezeInterval = setInterval(() => {
            const before = new Date().getTime();
            debugger;
            const after = new Date().getTime();
            if (after - before > 100) {
                window.location.reload();
            }
        }, 1000);

        document.addEventListener('contextmenu', preventContext);
        document.addEventListener('keydown', preventKeys);

        return () => {
            clearInterval(freezeInterval);
            document.removeEventListener('contextmenu', preventContext);
            document.removeEventListener('keydown', preventKeys);
        };
    }, []);

    return null;
}
