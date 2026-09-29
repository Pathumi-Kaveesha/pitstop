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

import CategoryIcon from "@mui/icons-material/Category";
import CloseIcon from "@mui/icons-material/Close";
import DeleteIcon from "@mui/icons-material/Delete";
import DescriptionIcon from "@mui/icons-material/Description";
import ImageIcon from "@mui/icons-material/Image";
import LabelIcon from "@mui/icons-material/Label";
import LinkIcon from "@mui/icons-material/Link";
import SubtitlesIcon from "@mui/icons-material/Subtitles";
import TitleIcon from "@mui/icons-material/Title";
import {
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormHelperText,
  IconButton,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
  createFilterOptions,
  useTheme,
} from "@mui/material";
import { useFormik } from "formik";

import React, { useEffect, useRef, useState } from "react";

import RichTextEditor from "@components/common/RichTextEditor";
import {
  createNewContent,
  createTag,
  deleteTag,
  getAllTags,
  updateContent,
} from "@slices/pageSlice/page";
import { RootState, useAppDispatch, useAppSelector } from "@slices/store";
import { AppConfig } from "@config/config";
import { ApiService } from "@utils/apiService";
import { CONTENT_SUBTYPE, FILETYPE } from "@utils/types";

import {
  ContentDialogBoxProps,
  CustomStylingInfo,
  TagResponse,
  validationContentSchema,
} from "../../types/types";

// Content that Smart Search indexes via a separate stand-in document instead of its own link
const needsTranscript = (contentType: string, contentSubtype?: string): boolean =>
  (contentType === FILETYPE.External_Link && contentSubtype === CONTENT_SUBTYPE.Video) ||
  contentType === FILETYPE.Lms ||
  contentType === FILETYPE.Salesforce;

// The same stored link means something different to fill in, depending on content type.
const transcriptFieldInfo = (contentType: string) =>
  contentType === FILETYPE.External_Link
    ? {
        label: "Video Transcript (Google Doc)",
        helperText: "Used only so Smart Search can find this video - never shown to users.",
      }
    : {
        label: "Material Info Link (Google Doc)",
        helperText:
          "A short description of this material, since Smart Search can't read it directly - used only for search, never shown to users.",
      };

const ContentDialogBox = ({
  isOpen,
  handleClose,
  sectionId,
  initialValues,
  type,
}: ContentDialogBoxProps) => {
  const dispatch = useAppDispatch();
  const theme = useTheme();
  const tagInfo = useAppSelector((state: RootState) =>
    state.page.tagData.map((tag: TagResponse) => tag.tagName),
  );

  const [noteDefaultStyleConfigs, setNoteDefaultStyleConfigs] = useState<
    CustomStylingInfo | undefined
  >(initialValues?.customContentTheme?.note);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const autocompleteRef = useRef<HTMLInputElement>(null);
  const dialogContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      dispatch(getAllTags());
    }
  }, [isOpen, dispatch]);

  const filter = createFilterOptions<string>();

  const dialogBoxTitle = () => {
    if (type === "add") {
      return "Add New Content";
    } else {
      return "Update Content";
    }
  };

  const dialogSubtitle = () => {
    if (type === "add") {
      return "Create new content for your section";
    } else {
      return "Update content details and settings";
    }
  };

  const handleAddContent = (values: typeof formik.values, tagsString: string) => {
    const newLink = {
      contentLink: values.contentLink,
      transcriptLink: needsTranscript(values.contentType, values.contentSubtype)
        ? values.transcriptLink
        : undefined,
      contentType: values.contentType,
      contentSubtype:
        values.contentType === FILETYPE.External_Link ? values.contentSubtype : undefined,
      description: values.description,
      thumbnail: values.thumbnail,
      note: values.note,
      sectionId: sectionId ? sectionId : 0,
      customContentTheme: {
        note: noteDefaultStyleConfigs,
      },
      tags: tagsString,
      isReused: values.isReused,
    };
    dispatch(
      createNewContent({
        content: newLink,
        routePath: window.location.pathname,
      }),
    );
  };

  const handleUpdateContent = (values: typeof formik.values, tagsString: string) => {
    const updatedContent = {
      contentLink: values.contentLink,
      transcriptLink: needsTranscript(values.contentType, values.contentSubtype)
        ? values.transcriptLink
        : undefined,
      contentType: values.contentType,
      contentSubtype:
        values.contentType === FILETYPE.External_Link ? values.contentSubtype : undefined,
      description: values.description,
      thumbnail: values.thumbnail,
      note: values.note,
      customContentTheme: {
        note: noteDefaultStyleConfigs,
      },
      verifyContent: values.verifyContent,
      tags: tagsString,
      isReused: values.isReused,
    };
    dispatch(
      updateContent({
        content: updatedContent,
        contentId: values.contentId,
        routePath: window.location.pathname,
      }),
    );
  };

  const formik = useFormik({
    initialValues: {
      contentId: initialValues?.contentId ?? 0,
      sectionId: initialValues?.sectionId ?? 0,
      contentLink: initialValues?.contentLink ?? "",
      transcriptLink: "",
      contentType: initialValues?.contentType ?? "",
      contentSubtype: initialValues?.contentSubtype || CONTENT_SUBTYPE.Generic,
      description: initialValues?.description ?? "",
      thumbnail: initialValues?.thumbnail ?? "",
      note: initialValues?.note ?? "",
      verifyContent: initialValues?.verifyContent ?? false,
      tags: initialValues?.tags ?? [],
      isReused: Boolean(initialValues?.isReused),
    },
    validationSchema: validationContentSchema,
    enableReinitialize: true,
    onSubmit: (values) => {
      const tagsString = values.tags.join(",");

      if (type === "add") {
        handleAddContent(values, tagsString);
      } else if (type === "update") {
        handleUpdateContent(values, tagsString);
      }

      handleClose();
      formik.resetForm();
    },
  });

  // The transcript link is admin-only, so it's fetched separately, only when it's actually needed
  const contentId = initialValues?.contentId;
  const showsTranscript = needsTranscript(formik.values.contentType, formik.values.contentSubtype);
  useEffect(() => {
    if (!isOpen || type !== "update" || !showsTranscript || !contentId) {
      return;
    }
    ApiService.getInstance()
      .get<{ transcriptLink: string }>(AppConfig.serviceUrls.getTranscriptLink(contentId))
      .then((response) => {
        formik.setFieldValue("transcriptLink", response.data?.transcriptLink ?? "");
      })
      .catch(() => {
        // Left blank - the admin can still type it in
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, type, showsTranscript, contentId]);

  const handleDeleteTag = async (tagName: string) => {
    try {
      await dispatch(deleteTag({ tagName })).unwrap();
      await dispatch(getAllTags()).unwrap();
      const updatedTags = formik.values.tags.filter((tag) => tag !== tagName);
      formik.setFieldValue("tags", updatedTags);
    } catch (error) {
      console.error("Failed to delete tag:", error);
    }
  };

  const handleDialogClose = () => {
    handleClose();
  };

  useEffect(() => {
    if (isOpen && initialValues?.note) {
      setNoteDefaultStyleConfigs((prevConfigs) => {
        if (prevConfigs?.htmlContent) {
          return prevConfigs;
        }
        return {
          ...(prevConfigs || {}),
          richText: true,
          htmlContent: initialValues.note,
        };
      });
    }
  }, [isOpen, initialValues?.note]);

  return (
    <Dialog open={isOpen} onClose={handleDialogClose} maxWidth="sm" fullWidth>
      <DialogTitle
        sx={{
          background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.light} 100%)`,
          color: theme.palette.common.white,
          py: 2.5,
          pb: 3,
          position: "relative",
        }}
      >
        <Typography variant="h4" fontWeight="bold" gutterBottom sx={{ mb: 0.5 }}>
          {dialogBoxTitle()}
        </Typography>
        <Typography variant="body2" sx={{ opacity: 0.95 }}>
          {dialogSubtitle()}
        </Typography>
        <IconButton
          aria-label="close"
          onClick={handleDialogClose}
          sx={{
            position: "absolute",
            right: 16,
            top: 16,
            color: theme.palette.common.white,
          }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 4, pb: 2 }} ref={dialogContentRef}>
        <Stack spacing={3}>
          {/* Page Title */}
          <Box>
            <Box sx={{ display: "flex", alignItems: "center", mb: 1.5 }}>
              <TitleIcon
                sx={{
                  color: theme.palette.primary.main,
                  mr: 1,
                  fontSize: 22,
                  mt: 2,
                }}
              />
              <Typography variant="body1" fontWeight="700" mt={2}>
                Component Title
              </Typography>
            </Box>
            <TextField
              fullWidth
              name="description"
              placeholder="Enter page title"
              value={formik.values.description}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              error={formik.touched.description && Boolean(formik.errors.description)}
              helperText={formik.touched.description && formik.errors.description}
            />
          </Box>

          {/* Component Type */}
          <Box>
            <Box sx={{ display: "flex", alignItems: "center", mb: 1.5 }}>
              <CategoryIcon sx={{ color: theme.palette.primary.main, mr: 1, fontSize: 22 }} />
              <Typography
                variant="body1"
                fontWeight="700"
                sx={{ color: theme.palette.text.primary }}
              >
                Component Type
              </Typography>
            </Box>
            <FormControl fullWidth>
              <Select
                fullWidth
                value={formik.values.contentType}
                onBlur={formik.handleBlur}
                onChange={(event) => formik.setFieldValue("contentType", event.target.value)}
                error={formik.touched.contentType && Boolean(formik.errors.contentType)}
                displayEmpty
              >
                <MenuItem value="" disabled>
                  Select component type
                </MenuItem>
                {Object.values(FILETYPE).map((type) => (
                  <MenuItem key={type} value={type}>
                    {type}
                  </MenuItem>
                ))}
              </Select>
              {formik.touched.contentType && formik.errors.contentType && (
                <FormHelperText error>{formik.errors.contentType}</FormHelperText>
              )}
            </FormControl>

            {formik.values.contentType === FILETYPE.External_Link && (
              <FormControl fullWidth sx={{ mt: 2 }}>
                <Typography
                  variant="body2"
                  fontWeight="600"
                  sx={{ mb: 1, color: theme.palette.text.primary }}
                >
                  External Link Type
                </Typography>
                <Select
                  value={formik.values.contentSubtype || CONTENT_SUBTYPE.Generic}
                  onChange={(e) => formik.setFieldValue("contentSubtype", e.target.value)}
                  displayEmpty
                >
                  <MenuItem value={CONTENT_SUBTYPE.Generic}>Generic link</MenuItem>
                  <MenuItem value={CONTENT_SUBTYPE.GDoc}>Google Doc</MenuItem>
                  <MenuItem value={CONTENT_SUBTYPE.Pdf}>PDF</MenuItem>
                  <MenuItem value={CONTENT_SUBTYPE.Video}>Video / MP4</MenuItem>
                </Select>
              </FormControl>
            )}
          </Box>

          {/* Component Link */}
          <Box>
            <Box sx={{ display: "flex", alignItems: "center", mb: 1.5 }}>
              <LinkIcon sx={{ color: theme.palette.primary.main, mr: 1, fontSize: 22 }} />
              <Typography
                variant="body1"
                fontWeight="700"
                sx={{ color: theme.palette.text.primary }}
              >
                Component Link
              </Typography>
            </Box>
            <TextField
              fullWidth
              name="contentLink"
              placeholder="https://example.com/component"
              value={formik.values.contentLink}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              error={formik.touched.contentLink && Boolean(formik.errors.contentLink)}
              helperText={formik.touched.contentLink && formik.errors.contentLink}
            />
          </Box>

          {/* Transcript link, or a material info link - used only for Smart Search indexing, never shown to users */}
          {showsTranscript && (
            <Box>
              <Box sx={{ display: "flex", alignItems: "center", mb: 1.5 }}>
                <SubtitlesIcon sx={{ color: theme.palette.primary.main, mr: 1, fontSize: 22 }} />
                <Typography
                  variant="body1"
                  fontWeight="700"
                  sx={{ color: theme.palette.text.primary }}
                >
                  {transcriptFieldInfo(formik.values.contentType).label}
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                {transcriptFieldInfo(formik.values.contentType).helperText}
              </Typography>
              <TextField
                fullWidth
                name="transcriptLink"
                placeholder="https://docs.google.com/document/d/..."
                value={formik.values.transcriptLink}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                error={formik.touched.transcriptLink && Boolean(formik.errors.transcriptLink)}
                helperText={formik.touched.transcriptLink && formik.errors.transcriptLink}
              />
            </Box>
          )}

          {/* Document Thumbnail Link */}
          <Box>
            <Box sx={{ display: "flex", alignItems: "center", mb: 1.5 }}>
              <ImageIcon sx={{ color: theme.palette.primary.main, mr: 1, fontSize: 22 }} />
              <Typography
                variant="body1"
                fontWeight="700"
                sx={{ color: theme.palette.text.primary }}
              >
                Document Thumbnail Link (Optional)
              </Typography>
            </Box>
            <TextField
              fullWidth
              name="thumbnail"
              placeholder="https://example.com/thumbnail.jpg"
              value={formik.values.thumbnail}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              error={formik.touched.thumbnail && Boolean(formik.errors.thumbnail)}
              helperText={formik.touched.thumbnail && formik.errors.thumbnail}
            />
          </Box>

          {/* Additional Notes */}
          <Box>
            <Box sx={{ display: "flex", alignItems: "center", mb: 1.5 }}>
              <DescriptionIcon sx={{ color: theme.palette.primary.main, mr: 1, fontSize: 22 }} />
              <Typography
                variant="body1"
                fontWeight="700"
                sx={{ color: theme.palette.text.primary }}
              >
                Additional Notes
              </Typography>
            </Box>

            <Box sx={{ position: "relative" }}>
              <RichTextEditor
                value={noteDefaultStyleConfigs?.htmlContent || formik.values.note}
                onChange={(html) => {
                  setNoteDefaultStyleConfigs({
                    ...noteDefaultStyleConfigs,
                    richText: true,
                    htmlContent: html,
                  });
                  const tempDiv = document.createElement("div");
                  tempDiv.innerHTML = html;
                  formik.setFieldValue("note", tempDiv.textContent || tempDiv.innerText || "");
                }}
                placeholder="Add notes (select text to format)"
                height="180px"
              />
              {formik.touched.note && formik.errors.note && (
                <FormHelperText error sx={{ mt: 1 }}>
                  {formik.errors.note}
                </FormHelperText>
              )}
            </Box>
          </Box>

          {/* Tags */}
          <Box>
            <Box sx={{ display: "flex", alignItems: "center", mb: 1.5 }}>
              <LabelIcon sx={{ color: theme.palette.primary.main, mr: 1, fontSize: 22 }} />
              <Typography
                variant="body1"
                fontWeight="700"
                sx={{ color: theme.palette.text.primary }}
              >
                Tags
              </Typography>
            </Box>
            <Autocomplete
              multiple
              freeSolo
              options={tagInfo}
              open={isDropdownOpen}
              onOpen={() => setIsDropdownOpen(true)}
              onClose={() => setIsDropdownOpen(false)}
              filterOptions={(options, params) => {
                const filtered = filter(options, params);
                const { inputValue } = params;
                if (inputValue.trim() !== "" && !options.includes(inputValue)) {
                  filtered.push(`Add "${inputValue}"`);
                }
                return filtered;
              }}
            value={formik.values.tags}
            onChange={async (_event, newValue) => {
              const finalValue = new Set<string>();
              const tagsToCreate = new Set<string>();

              for (const value of newValue) {
                if (value.startsWith('Add "')) {
                  const newTag = value.slice(5, -1).trim();
                  if (newTag === "") continue;

                  tagsToCreate.add(newTag);
                } else {
                  const normalizedValue = value.trim();
                  if (normalizedValue === "") continue;

                  if (tagInfo.includes(normalizedValue)) {
                    finalValue.add(normalizedValue);
                  } else {
                    tagsToCreate.add(normalizedValue);
                  }
                }
              }

              let createdTagNames: string[] = [];
              let failedTagNames: string[] = [];

              if (tagsToCreate.size > 0) {
                const tagNamesToCreate = Array.from(tagsToCreate);
                const creationResults = await Promise.allSettled(
                  tagNamesToCreate.map(async (tagName) => {
                    await dispatch(createTag({ tagName })).unwrap();
                    return tagName;
                  }),
                );

                createdTagNames = creationResults
                  .filter((result): result is PromiseFulfilledResult<string> =>
                    result.status === "fulfilled",
                  )
                  .map((result) => result.value);

                failedTagNames = creationResults
                  .map((result, index) =>
                    result.status === "rejected" ? tagNamesToCreate[index] : null,
                  )
                  .filter((tagName): tagName is string => Boolean(tagName));

                createdTagNames.forEach((tagName) => finalValue.add(tagName));

                if (failedTagNames.length > 0) {
                  console.error("Failed to create tags:", failedTagNames);
                }

                if (createdTagNames.length > 0) {
                  try {
                    await dispatch(getAllTags()).unwrap();
                  } catch (error) {
                    console.error("Failed to refresh tags:", error);
                  }
                }
              }

              formik.setFieldValue("tags", Array.from(finalValue));
            }}
              renderOption={(props, option) => {
                const { key, ...rest } = props;
                const isAddOption = option.startsWith('Add "');
                const tagName = isAddOption ? option.slice(5, -1) : option;

                return (
                  <li
                    {...rest}
                    key={key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      padding: "8px 16px",
                    }}
                  >
                    <span style={{ flex: 1 }}>{option}</span>
                    {!isAddOption && (
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTag(tagName);
                        }}
                        color="error"
                      >
                        <DeleteIcon />
                      </IconButton>
                    )}
                  </li>
                );
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  inputRef={autocompleteRef}
                  placeholder="Select or add tags"
                  variant="outlined"
                  fullWidth
                  onBlur={formik.handleBlur}
                  error={formik.touched.tags && Boolean(formik.errors.tags)}
                  helperText={formik.touched.tags && formik.errors.tags}
                />
              )}
            />
          </Box>

          {/* Checkboxes */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              p: 2,
              backgroundColor:
                theme.palette.mode === "dark" ? theme.palette.grey[800] : theme.palette.grey[50],
              borderRadius: 2,
            }}
          >
            <FormControl>
              <FormControlLabel
                control={
                  <Checkbox
                    id="verifyContent"
                    name="verifyContent"
                    checked={formik.values.verifyContent}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    sx={{
                      color: theme.palette.primary.main,
                      "&.Mui-checked": {
                        color: theme.palette.primary.main,
                      },
                    }}
                  />
                }
                label={
                  <Typography
                    variant="body2"
                    fontWeight="600"
                    sx={{
                      color: theme.palette.mode === "dark" ? theme.palette.common.white : "inherit",
                    }}
                  >
                    Verify Content
                  </Typography>
                }
              />
            </FormControl>

            <FormControl>
              <FormControlLabel
                control={
                  <Checkbox
                    id="isReused"
                    name="isReused"
                    checked={Boolean(formik.values.isReused)}
                    onChange={(e) => formik.setFieldValue("isReused", e.target.checked)}
                    onBlur={formik.handleBlur}
                    sx={{
                      color: theme.palette.primary.main,
                      "&.Mui-checked": {
                        color: theme.palette.primary.main,
                      },
                    }}
                  />
                }
                label={
                  <Typography
                    variant="body2"
                    fontWeight="600"
                    sx={{
                      color: theme.palette.mode === "dark" ? theme.palette.common.white : "inherit",
                    }}
                  >
                    Reused Content
                  </Typography>
                }
              />
            </FormControl>
          </Box>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
        <Button
          variant="outlined"
          onClick={handleClose}
          sx={{
            borderRadius: 2,
            textTransform: "none",
            px: 3,
            color: theme.palette.text.secondary,
            borderColor: theme.palette.divider,
            "&:hover": {
              borderColor: theme.palette.action.hover,
              backgroundColor: theme.palette.action.hover,
            },
          }}
        >
          Cancel
        </Button>

        <Button
          variant="contained"
          onClick={(e: React.MouseEvent<HTMLButtonElement>) => formik.handleSubmit(e as never)}
          disabled={!formik.isValid}
          sx={{
            textTransform: "none",
            px: 3,
            color: theme.palette.common.white,
            background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.light} 100%)`,
            "&:hover": {
              background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
            },
          }}
        >
          {type === "add" ? "Add Content" : "Update Content"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ContentDialogBox;
