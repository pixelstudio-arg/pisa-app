/* Pisa — configuración de la instalación.
   1) adminPin: clave para entrar al panel de gestión (cambiala antes de entregar).
   2) firebase: pegá acá la configuración web de tu proyecto de Firebase
      (Consola de Firebase → Configuración del proyecto → Tus apps → Web).
      Mientras databaseURL esté vacío, la app funciona en "modo local":
      los datos quedan solo en ese navegador. */
const PISA_CONFIG = {
  adminPin: '2580',
  firebase: {
    apiKey: 'AIzaSyDvafYR-f9GSR-pdvkiCtME9K6vrHQ-hJ4',
    authDomain: 'pisa-app.firebaseapp.com',
    databaseURL: 'https://pisa-app-default-rtdb.firebaseio.com',
    projectId: 'pisa-app',
    appId: '1:690598074954:web:2ed921b22b639121a924b3',
  },
};
