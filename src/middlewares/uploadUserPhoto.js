const multer = require("multer");
const path = require("path");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/users");
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const name = "user_" + req.params.id + "_" + Date.now() + ext;
    cb(null, name);
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image")) {
    cb(null, true);
  } else {
    cb(new Error("Solo imágenes"), false);
  }
};

const upload = multer({
  storage,
  fileFilter
});

module.exports = upload;