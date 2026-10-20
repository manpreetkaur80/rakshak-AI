const express = require("express");
const router = express.Router();

const Incident = require("../models/Incident");

// GET all incidents
router.get("/", async (req, res) => {
  try {
    const incidents = await Incident.find().sort({
      createdAt: -1,
    });

    res.status(200).json(incidents);
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch incidents",
      error: error.message,
    });
  }
});

// GET single incident
router.get("/:id", async (req, res) => {
  try {
    const incident = await Incident.findById(req.params.id);

    if (!incident) {
      return res.status(404).json({
        message: "Incident not found",
      });
    }

    res.status(200).json(incident);
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch incident",
      error: error.message,
    });
  }
});

// CREATE incident
router.post("/", async (req, res) => {
  try {
    const {
      type,
      location,
      description,
      severity,
      priority,
      reportedBy,
    } = req.body;

    const incident = new Incident({
      type,
      location,
      description,
      severity,
      priority,
      reportedBy,
    });

    const savedIncident = await incident.save();

    res.status(201).json({
      message: "Emergency reported successfully",
      incident: savedIncident,
    });
  } catch (error) {
    res.status(400).json({
      message: "Failed to report emergency",
      error: error.message,
    });
  }
});

// UPDATE incident status
router.put("/:id/status", async (req, res) => {
  try {
    const { status } = req.body;

    const incident = await Incident.findByIdAndUpdate(
      req.params.id,
      { status },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!incident) {
      return res.status(404).json({
        message: "Incident not found",
      });
    }

    res.status(200).json({
      message: "Incident status updated",
      incident,
    });
  } catch (error) {
    res.status(400).json({
      message: "Failed to update incident status",
      error: error.message,
    });
  }
});

// DELETE incident
router.delete("/:id", async (req, res) => {
  try {
    const incident = await Incident.findByIdAndDelete(
      req.params.id
    );

    if (!incident) {
      return res.status(404).json({
        message: "Incident not found",
      });
    }

    res.status(200).json({
      message: "Incident deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to delete incident",
      error: error.message,
    });
  }
});

module.exports = router;