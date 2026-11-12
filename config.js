/* Pisa — configuración de la instalación.
   1) adminPin: clave para entrar al panel de gestión (cambiala antes de entregar).
   2) firebase: pegá acá la configuración web de tu proyecto de Firebase
      (Consola de Firebase → Configuración del proyecto → Tus apps → Web).
      Mientras databaseURL esté vacío, la app funciona en "modo local":
      los datos quedan solo en ese navegador. */
const PISA_CONFIG = {
  adminPin: '2580',
  firebase: {
    apiKey: '',
    authDomain: '',
    databaseURL: '',
    projectId: '',
    appId: '',
  },
};
