import { Router } from 'express';
import {
  crearNuevoLead,
  getUsuario,
  getLead,
  getProyectos,
  getProyectoById,
  getTipologia,
  getUnidadesByProyecto,
  getUnidades,
  getCita,
  crearCita,
  updateLead
} from "../controllers/viva.controller.js";

const router = Router();

router.get("/viva/usuario/:id", getUsuario);
router.post("/viva/lead", crearNuevoLead);
router.put("/viva/lead/:id", updateLead);
router.get("/viva/lead/:id", getLead);
router.get("/viva/proyectos/:distrito", getProyectos);
router.get("/viva/proyecto/:id", getProyectoById);
router.get("/viva/tipologia/:id", getTipologia);
router.get("/viva/unidades/:id", getUnidadesByProyecto);
router.get("/viva/unidad/:id", getUnidades)
router.get("/viva/cita/:id", getCita);
router.post("/viva/cita", crearCita);


export default router;