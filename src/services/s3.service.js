const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const path = require('path');

class S3Service {
  constructor() {
    this.client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });
    this.bucket = process.env.S3_BUCKET || 'aiyou-uploads';
    this.platformFolder = process.env.S3_PLATFORM_FOLDER || 'app';
  }

  async uploadFile(file, folder = 'catalogo', idEmpresa = 'general') {
    const now = new Date();

    // Formato de fecha para la carpeta: YYYY-MM-DD
    const dateFolder = now.getFullYear().toString() +
      '-' + (now.getMonth() + 1).toString().padStart(2, '0') +
      '-' + now.getDate().toString().padStart(2, '0');

    // Timestamp para el nombre del archivo
    const timestamp = now.getFullYear().toString() +
      (now.getMonth() + 1).toString().padStart(2, '0') +
      now.getDate().toString().padStart(2, '0') +
      now.getHours().toString().padStart(2, '0') +
      now.getMinutes().toString().padStart(2, '0') +
      now.getSeconds().toString().padStart(2, '0');

    const ext = path.extname(file.originalname).toLowerCase();
    const filename = `${folder}_${timestamp}${ext}`;

    // Estructura: app/{id_empresa}/{folder}/{fecha}/{imagen}
    const key = `${this.platformFolder}/${idEmpresa}/${folder}/${dateFolder}/${filename}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype
    });

    await this.client.send(command);

    const url = `https://${this.bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
    return url;
  }

  async deleteFile(fileUrl) {
    try {
      const url = new URL(fileUrl);
      const key = url.pathname.substring(1);

      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key
      });

      await this.client.send(command);
      return true;
    } catch (error) {
      console.error('Error al eliminar archivo de S3:', error);
      return false;
    }
  }
}

module.exports = new S3Service();
