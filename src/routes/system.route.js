const { Router } = require("express");
const axios = require("axios");

const router = Router();

// URL base del servidor Asterisk
const ASTERISK_BASE_URL = process.env.ASTERISK_API_URL || 'https://bot.ai-you.io';

/**
 * @swagger
 * /api/system/tools:
 *   get:
 *     summary: Obtiene las herramientas disponibles del servidor Asterisk
 *     tags: [System]
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Categoría de herramientas (ej. generica)
 *     responses:
 *       200:
 *         description: Lista de herramientas
 *       500:
 *         description: Error del servidor
 */
router.get("/tools", async (req, res) => {
    try {
        const { category } = req.query;

        let url = `${ASTERISK_BASE_URL}/api/system/tools`;
        if (category) {
            url += `?category=${encodeURIComponent(category)}`;
        }

        const response = await axios.get(url, {
            headers: {
                'Authorization': `Bearer ${process.env.AIYOU_API_TOKEN_ASTERISK}`,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });

        res.json(response.data);
    } catch (error) {
        console.error('Error al obtener tools del servidor Asterisk:', error.message);

        if (error.response) {
            return res.status(error.response.status).json({
                success: false,
                message: error.response.data?.message || 'Error del servidor Asterisk',
                error: error.message
            });
        }

        res.status(500).json({
            success: false,
            message: 'Error al conectar con el servidor Asterisk',
            error: error.message
        });
    }
});

module.exports = router;
