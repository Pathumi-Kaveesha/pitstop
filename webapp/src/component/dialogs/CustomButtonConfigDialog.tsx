// Copyright (c) 2026 WSO2 LLC. (https://www.wso2.com).
//
// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  Select,
  MenuItem,
  Switch,
  Box,
  Typography,
  IconButton,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Snackbar,
  Stack,
  useTheme,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import LinkIcon from "@mui/icons-material/Link";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import DescriptionIcon from "@mui/icons-material/Description";
import SlideshowIcon from "@mui/icons-material/Slideshow";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import ArticleIcon from "@mui/icons-material/Article";
import CloseIcon from "@mui/icons-material/Close";
import SettingsIcon from "@mui/icons-material/Settings";
import { CustomButton } from "@/types/types";

interface CustomButtonConfigDialogProps {
  open: boolean;
  onClose: () => void;
  contentId: number;
  sectionId: number;
  initialButtons: CustomButton[];
  onSave: (buttons: CustomButton[]) => void;
}

const defaultButton: Omit<CustomButton, "id"> = {
  label: "",
  icon: "none",
  color: "orange",
  action: "link",
  actionValue: "",
  isVisible: true,
  order: 0,
  contentId: "",
};

const iconOptions = [
  { value: "none", label: "None", icon: null },
  { value: "link", label: "Link", icon: <LinkIcon /> },
  { value: "record", label: "Record", icon: <PlayArrowIcon /> },
  { value: "document", label: "Document", icon: <DescriptionIcon /> },
  { value: "presentation", label: "Presentation", icon: <SlideshowIcon /> },
  { value: "brochure", label: "Brochure", icon: <MenuBookIcon /> },
  { value: "article", label: "Article", icon: <ArticleIcon /> },
];

const actionOptions = [
  { value: "link", label: "Open Link" },
  { value: "download", label: "Download File" },
];

// Same rule the backend applies to links.
const VALID_LINK =
  /^(https?|ftp|smtp):\/\/(?:www\.)?[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?::\d{1,5})?(?:[\/?#]\S*)?$/;

const CustomButtonConfigDialog: React.FC<CustomButtonConfigDialogProps> = ({
  open,
  onClose,
  contentId,
  initialButtons,
  onSave,
}) => {
  const theme = useTheme();
  const [buttons, setButtons] = useState<CustomButton[]>(initialButtons);
  const [hasChanges, setHasChanges] = useState(false);
  const [expandedAccordion, setExpandedAccordion] = useState<number | false>(
    false
  );
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string }>({
    open: false,
    message: "",
  });

  useEffect(() => {
    setButtons(initialButtons);
    setHasChanges(false);
  }, [initialButtons]);

  const handleAddButton = () => {
    const newButton: CustomButton = {
      ...defaultButton,
      id: -(buttons.length + 1),
      contentId: contentId.toString(),
      order: buttons.length,
      isVisible: true,
    };
    setButtons([...buttons, newButton]);
    setExpandedAccordion(newButton.id);
    setHasChanges(true);
  };

  const handleUpdateButton = (id: number, updates: Partial<CustomButton>) => {
    setButtons(
      buttons.map((button) =>
        button.id === id ? { ...button, ...updates } : button
      )
    );
    setHasChanges(true);
  };

  const handleDeleteButton = (id: number) => {
    setButtons(buttons.filter((button) => button.id !== id));
    setHasChanges(true);
  };

  const handleSave = () => {
    if (buttons.length === 0) {
      onSave([]);
      onClose();
      return;
    }

    const invalidButtons = buttons.filter(
      (button) =>
        !button.contentId ||
        !button.action ||
        !button.actionValue?.trim() ||
        ((!button.icon || button.icon === "none") && !button.label?.trim())
    );

    if (invalidButtons.length > 0) {
      setSnackbar({
        open: true,
        message:
          "Please ensure each button has either an icon or a label, and all required fields are filled.",
      });
      return;
    }

    // Links nobody changed are left alone, so older buttons can still be saved.
    const hasInvalidLink = buttons.some((button) => {
      const link = button.actionValue?.trim() ?? "";
      const savedLink = initialButtons
        .find((saved) => saved.id === button.id)
        ?.actionValue?.trim();
      return link !== savedLink && !VALID_LINK.test(link);
    });

    if (hasInvalidLink) {
      setSnackbar({
        open: true,
        message:
          "Please enter a valid link for each button, for example https://example.com",
      });
      return;
    }

    const orderedButtons: CustomButton[] = buttons.map((button, index) => {
      const processedButton: CustomButton = {
        id: button.id,
        label: button.label?.trim() || "",
        icon:
          !button.icon || button.icon === "none"
            ? ("none" as CustomButton["icon"])
            : (button.icon as CustomButton["icon"]),
        color: "orange" as CustomButton["color"],
        action: button.action as CustomButton["action"],
        actionValue: button.actionValue?.trim(),
        isVisible: button.isVisible,
        order: index,
        contentId: contentId.toString(),
      };
      return processedButton;
    });

    onSave(orderedButtons);
    onClose();
  };

  const handleAccordionChange =
    (panel: number) => (_event: React.SyntheticEvent, isExpanded: boolean) => {
      setExpandedAccordion(isExpanded ? panel : false);
    };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          overflow: "visible",
        },
      }}
    >
      <DialogTitle
        sx={{
          background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.light} 100%)`,
          color: "white",
          py: 2.5,
          pb: 3,
          position: "relative",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 0.5 }}>
          <SettingsIcon sx={{ fontSize: 32 }} />
          <Typography variant="h4" fontWeight="bold">
            Customize Buttons
          </Typography>
        </Box>
        <Typography variant="body2" sx={{ opacity: 0.95, ml: 5 }}>
          Add up to 4 custom buttons for this content card
        </Typography>
        <IconButton
          aria-label="close"
          onClick={onClose}
          sx={{
            position: "absolute",
            right: 16,
            top: 16,
            color: "white",
          }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 4, pb: 2 }}>
        <Box sx={{ mb: 3, mt: 2 }}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleAddButton}
            disabled={buttons.length >= 4}
            sx={{
              borderRadius: 2,
              textTransform: "none",
              px: 3,
              color: "white",
              background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.light} 100%)`,
              "&:hover": {
                background: `linear-gradient(135deg, ${theme.palette.primary.dark} 0%, ${theme.palette.primary.main} 100%)`,
              },
              "&:disabled": {
                background: theme.palette.grey[300],
                color: theme.palette.grey[500],
              },
            }}
          >
            Add Button {buttons.length < 4 && `(${buttons.length}/4)`}
          </Button>
        </Box>

        <Stack spacing={2}>
          {buttons.length === 0 && (
            <Box
              sx={{
                p: 4,
                textAlign: "center",
                backgroundColor:
                  theme.palette.mode === "dark"
                    ? theme.palette.grey[800]
                    : theme.palette.grey[50],
                borderRadius: 2,
              }}
            >
              <Typography variant="body1" color="text.secondary">
                No buttons added yet. Click "Add Button" to create your first
                custom button.
              </Typography>
            </Box>
          )}

          {buttons.map((button, index) => (
            <Accordion
              key={button.id}
              expanded={expandedAccordion === button.id}
              onChange={handleAccordionChange(button.id)}
              sx={{
                borderRadius: 2,
                "&:before": {
                  display: "none",
                },
                boxShadow: 1,
              }}
            >
              <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
                aria-controls={`panel-${button.id}-content`}
                id={`panel-${button.id}-header`}
                sx={{
                  backgroundColor:
                    theme.palette.mode === "dark"
                      ? theme.palette.grey[800]
                      : theme.palette.grey[50],
                }}
              >
                <Box
                  sx={{ display: "flex", alignItems: "center", width: "100%" }}
                >
                  <DragIndicatorIcon sx={{ mr: 1, color: "text.secondary" }} />
                  <Typography sx={{ flexGrow: 1, fontWeight: 600 }}>
                    {button.label ||
                      (button.icon &&
                        button.icon !== "none" &&
                        iconOptions.find((opt) => opt.value === button.icon)
                          ?.label) ||
                      `Button ${index + 1}`}
                  </Typography>
                  <Box
                    sx={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 1,
                      px: 1.25,
                      py: 0.45,
                      borderRadius: 2,
                      background: button.isVisible
                        ? "linear-gradient(90deg, rgba(255,235,224,0.9) 0%, rgba(255,217,188,0.9) 100%)"
                        : "transparent",
                      border: button.isVisible
                        ? `1px solid rgba(255,115,0,0.15)`
                        : `1px dashed ${theme.palette.grey[400]}`,
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      boxShadow: button.isVisible
                        ? "0 4px 10px rgba(255,115,0,0.08)"
                        : "none",
                      mr: 1,
                    }}
                  >
                    <Box component="span" sx={{ lineHeight: 1 }}>
                      {button.isVisible ? "Visible" : "Hidden"}
                    </Box>
                  </Box>
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteButton(button.id);
                    }}
                    sx={{
                      ml: 1,
                      color: "error.main",
                      "&:hover": {
                        backgroundColor: "error.light",
                      },
                    }}
                  >
                    <DeleteIcon />
                  </IconButton>
                </Box>
              </AccordionSummary>

              <AccordionDetails sx={{ p: 3 }}>
                <Stack spacing={3}>
                  {/* Button Label */}
                  <Box>
                    <Box
                      sx={{ display: "flex", alignItems: "center", mb: 1.5 }}
                    >
                      <DescriptionIcon
                        sx={{ color: theme.palette.primary.main, mr: 1, fontSize: 22 }}
                      />
                      <Typography
                        variant="body1"
                        fontWeight="700"
                        sx={{ color: theme.palette.text.primary }}
                      >
                        Button Label
                      </Typography>
                    </Box>
                    <TextField
                      fullWidth
                      placeholder="Enter button label"
                      value={button.label}
                      onChange={(e) =>
                        handleUpdateButton(button.id, { label: e.target.value })
                      }
                    />
                  </Box>

                  <Box
                    sx={{
                      display: "grid",
                      gap: 3,
                      gridTemplateColumns: "repeat(2, 1fr)",
                    }}
                  >
                    {/* Icon Selection */}
                    <Box>
                      <Box
                        sx={{ display: "flex", alignItems: "center", mb: 1.5 }}
                      >
                        <SettingsIcon
                          sx={{ color: theme.palette.primary.main, mr: 1, fontSize: 22 }}
                        />
                        <Typography
                          variant="body1"
                          fontWeight="700"
                          sx={{ color: theme.palette.text.primary }}
                        >
                          Icon
                        </Typography>
                      </Box>
                      <FormControl fullWidth>
                        <Select
                          value={button.icon || "none"}
                          onChange={(e) => {
                            const value = e.target.value;
                            handleUpdateButton(button.id, {
                              icon: value,
                            });
                          }}
                        >
                          {iconOptions.map((option) => (
                            <MenuItem
                              key={option.value ?? "none"}
                              value={option.value}
                            >
                              <Box
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 1,
                                }}
                              >
                                {option.icon}
                                <span>{option.label}</span>
                              </Box>
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Box>

                    {/* Action Type */}
                    <Box>
                      <Box
                        sx={{ display: "flex", alignItems: "center", mb: 1.5 }}
                      >
                        <LinkIcon
                          sx={{ color: theme.palette.primary.main, mr: 1, fontSize: 22 }}
                        />
                        <Typography
                          variant="body1"
                          fontWeight="700"
                          sx={{ color: theme.palette.text.primary }}
                        >
                          Action Type
                        </Typography>
                      </Box>
                      <FormControl fullWidth>
                        <Select
                          value={button.action}
                          onChange={(e) =>
                            handleUpdateButton(button.id, {
                              action: e.target.value as CustomButton["action"],
                            })
                          }
                        >
                          {actionOptions.map((option) => (
                            <MenuItem key={option.value} value={option.value}>
                              {option.label}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Box>
                  </Box>

                  {/* URL/Action Value */}
                  <Box>
                    <Box
                      sx={{ display: "flex", alignItems: "center", mb: 1.5 }}
                    >
                      <LinkIcon
                        sx={{ color: theme.palette.primary.main, mr: 1, fontSize: 22 }}
                      />
                      <Typography
                        variant="body1"
                        fontWeight="700"
                        sx={{ color: theme.palette.text.primary }}
                      >
                        {button.action === "link" ? "URL" : "Download URL"}
                      </Typography>
                    </Box>
                    <TextField
                      fullWidth
                      value={button.actionValue || ""}
                      onChange={(e) =>
                        handleUpdateButton(button.id, {
                          actionValue: e.target.value,
                        })
                      }
                      required
                      placeholder={
                        button.action === "link"
                          ? "https://example.com"
                          : "https://example.com/file.pdf"
                      }
                    />
                  </Box>

                  {/* Visibility Toggle */}
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <Typography
                      variant="body2"
                      fontWeight="600"
                      sx={{
                        color:
                          theme.palette.mode === "dark"
                            ? theme.palette.common.white
                            : "inherit",
                      }}
                    >
                      Button Visibility
                    </Typography>
                    <Switch
                      checked={button.isVisible}
                      onChange={(e) =>
                        handleUpdateButton(button.id, {
                          isVisible: e.target.checked,
                        })
                      }
                      sx={{
                        "& .MuiSwitch-switchBase.Mui-checked": {
                          color: theme.palette.primary.main,
                        },
                        "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track":
                          {
                            backgroundColor: theme.palette.primary.light,
                          },
                      }}
                    />
                  </Box>
                </Stack>
              </AccordionDetails>
            </Accordion>
          ))}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
        <Button
          variant="outlined"
          onClick={onClose}
          sx={{
            borderRadius: 2,
            textTransform: "none",
            px: 3,
            color: theme.palette.grey[700],
            borderColor: theme.palette.grey[300],
            "&:hover": {
              borderColor: theme.palette.grey[400],
              backgroundColor: theme.palette.grey[50],
            },
          }}
        >
          Cancel
        </Button>

        <Button
          variant="contained"
          onClick={handleSave}
          disabled={!hasChanges}
          sx={{
            borderRadius: 2,
            textTransform: "none",
            px: 3,
            backgroundColor: theme.palette.primary.main,
            color: theme.palette.common.white,
            "&:disabled": {
              backgroundColor: theme.palette.grey[300],
              color: theme.palette.grey[500],
            },
          }}
        >
          Save Buttons
        </Button>
      </DialogActions>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        message={snackbar.message}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </Dialog>
  );
};

export default CustomButtonConfigDialog;
