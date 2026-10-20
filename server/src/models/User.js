const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    publicId: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Invalid email format"],
    },
    phone: {
      type: String,
      default: null,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["citizen", "responder", "operator", "admin", "hospital"],
      default: "citizen",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    avatar: {
      type: String,
      default: null,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ publicId: 1 }, { unique: true });
userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });

// Hash password
userSchema.methods.comparePassword = async function (plainText) {
  return bcrypt.compare(plainText, this.passwordHash);
};

// Never expose password hash
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  return obj;
};

// Auto-generate publicId before validation
userSchema.pre("validate", async function (next) {
  if (!this.publicId) {
    const count = await mongoose.model("User").countDocuments();
    this.publicId = `USR-${String(10001 + count).padStart(5, "0")}`;
  }
  next();
});

module.exports = mongoose.model("User", userSchema);
