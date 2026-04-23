const { Router } = require("express");

const handleValidationErrors = require("../middlewares/handleValidation.middleware.js");
const { validateMaraviaCallback } = require("../middlewares/maraviaCallbackAuth.middleware.js");
const MessageProcessingController = require("../controllers/messageProcessing.controller.js");

const router = Router();

router.post("/message",
    handleValidationErrors,
    MessageProcessingController.processMessage
);

router.post("/status",
    validateMaraviaCallback,
    MessageProcessingController.updateMessageStatus
);



module.exports = router;