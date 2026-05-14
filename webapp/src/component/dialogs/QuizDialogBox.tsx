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

import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import LinkIcon from "@mui/icons-material/Link";
import SchoolIcon from "@mui/icons-material/School";
import {
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  MenuItem,
  Radio,
  Select,
  TextField,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";

import type { QuizAdmin } from "@/types/types";

type QuestionType = "mcq_single" | "mcq_multiple" | "rating" | "feedback";

interface AnswerOption {
  text: string;
  isCorrect: boolean;
}

interface QuestionFormData {
  text: string;
  type: QuestionType;
  answers: AnswerOption[];
  refLinks?: string[];
}

interface QuizDialogBoxProps {
  open: boolean;
  editingQuiz: QuizAdmin | null;
  formTitle: string;
  setFormTitle: (value: string) => void;
  formDescription: string;
  setFormDescription: (value: string) => void;
  formDueDate: string;
  setFormDueDate: (value: string) => void;
  formPassingScore: number | "";
  setFormPassingScore: (value: number | "") => void;
  formQuestions: QuestionFormData[];
  isLoadingQuestions: boolean;
  formSaving: boolean;
  onClose: () => void;
  onSave: () => void;
  onAddQuestion: () => void;
  onRemoveQuestion: (index: number) => void;
  onChangeQuestionType: (index: number, type: QuestionType) => void;
  onUpdateQuestion: (index: number, patch: Partial<QuestionFormData>) => void;
  onUpdateAnswer: (
    questionIndex: number,
    answerIndex: number,
    patch: Partial<AnswerOption>,
  ) => void;
  onSetSingleCorrect: (questionIndex: number, answerIndex: number) => void;
  onAddAnswer: (questionIndex: number) => void;
  onRemoveAnswer: (questionIndex: number, answerIndex: number) => void;
  onAddRefLink: (questionIndex: number) => void;
  onUpdateRefLink: (questionIndex: number, linkIndex: number, value: string) => void;
  onRemoveRefLink: (questionIndex: number, linkIndex: number) => void;
}

const QuizDialogBox = ({
  open,
  editingQuiz,
  formTitle,
  setFormTitle,
  formDescription,
  setFormDescription,
  formDueDate,
  setFormDueDate,
  formPassingScore,
  setFormPassingScore,
  formQuestions,
  isLoadingQuestions,
  formSaving,
  onClose,
  onSave,
  onAddQuestion,
  onRemoveQuestion,
  onChangeQuestionType,
  onUpdateQuestion,
  onUpdateAnswer,
  onSetSingleCorrect,
  onAddAnswer,
  onRemoveAnswer,
  onAddRefLink,
  onUpdateRefLink,
  onRemoveRefLink,
}: QuizDialogBoxProps) => {
  const theme = useTheme();

  const inputSx = {
    "& .MuiOutlinedInput-root": {
      borderRadius: "10px",
      backgroundColor: theme.palette.background.default,
    },
  };

  const isSaveDisabled =
    formSaving ||
    isLoadingQuestions ||
    !formTitle.trim() ||
    !formDueDate ||
    formPassingScore === "" ||
    Number.isNaN(Number(formPassingScore));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3, maxHeight: "90vh" } }}
    >
      <DialogTitle
        sx={{
          background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.light} 100%)`,
          color: theme.palette.common.white,
          py: 2.5,
          pb: 3,
          position: "relative",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 0.5 }}>
          <SchoolIcon sx={{ fontSize: 32 }} />
          <Typography variant="h4" fontWeight="bold">
            {editingQuiz ? "Edit quiz" : "Create new quiz"}
          </Typography>
        </Box>
        <Typography variant="body2" sx={{ opacity: 0.95, ml: 5.5 }}>
          Add questions of any type and optionally attach a learning link.
        </Typography>
        <IconButton
          onClick={onClose}
          size="small"
          sx={{ position: "absolute", right: 16, top: 16, color: theme.palette.common.white }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 2, display: "flex", flexDirection: "column", gap: 2.5 }}>
        <Box>
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.75, mt: 2 }}>
            Title
          </Typography>
          <TextField
            placeholder="e.g. Channel Sales Fundamentals"
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
            fullWidth
            size="small"
            required
            sx={inputSx}
          />
        </Box>

        <Box>
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.75 }}>
            Description
          </Typography>
          <TextField
            placeholder="Short summary of what this quiz covers..."
            value={formDescription}
            onChange={(e) => setFormDescription(e.target.value)}
            multiline
            rows={3}
            fullWidth
            size="small"
            sx={inputSx}
          />
        </Box>

        <Box>
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.75 }}>
            Due date and time
          </Typography>
          <TextField
            type="datetime-local"
            value={formDueDate}
            onChange={(e) => setFormDueDate(e.target.value)}
            fullWidth
            size="small"
            required
            InputLabelProps={{ shrink: true }}
            sx={{ ...inputSx, maxWidth: 240 }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
            After this date and time the quiz disappears from the user dashboard.
          </Typography>
        </Box>

        <Box>
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.75 }}>
            Passing score (%)
          </Typography>
          <TextField
            type="number"
            value={formPassingScore === "" ? "" : formPassingScore}
            onChange={(e) => {
              const value = e.target.value;
              setFormPassingScore(value === "" ? "" : Number(value));
            }}
            inputProps={{ min: 0, max: 100 }}
            size="small"
            required
            sx={{ ...inputSx, maxWidth: 160 }}
          />
        </Box>

        <Box>
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5 }}>
            Questions ({formQuestions.length})
          </Typography>

          {isLoadingQuestions ? (
            <Box sx={{ py: 3, display: "flex", justifyContent: "center" }}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {formQuestions.map((q, qIdx) => (
                <Box
                  key={qIdx}
                  sx={{ border: `1px solid ${theme.palette.divider}`, borderRadius: 2, p: 2 }}
                >
                  {/* ── Question header ── */}
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      mb: 1.5,
                    }}
                  >
                    <Typography variant="subtitle2" fontWeight={600} color="primary">
                      Question {qIdx + 1}
                    </Typography>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Select
                        value={q.type}
                        onChange={(e) => onChangeQuestionType(qIdx, e.target.value as QuestionType)}
                        size="small"
                        sx={{ minWidth: 170, borderRadius: 2, fontSize: "0.85rem" }}
                      >
                        <MenuItem value="mcq_single">Single answer</MenuItem>
                        <MenuItem value="mcq_multiple">Multiple answers</MenuItem>
                        <MenuItem value="rating">Rating</MenuItem>
                        <MenuItem value="feedback">Feedback (text)</MenuItem>
                      </Select>
                      <IconButton
                        size="small"
                        onClick={() => onRemoveQuestion(qIdx)}
                        sx={{ color: theme.palette.redAccent[200] }}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </Box>

                  {/* ── Question prompt ── */}
                  <TextField
                    placeholder="Type the question prompt"
                    value={q.text}
                    onChange={(e) => onUpdateQuestion(qIdx, { text: e.target.value })}
                    fullWidth
                    size="small"
                    multiline
                    sx={{ ...inputSx, mb: 1.5 }}
                  />

                  {/* ── Answer options ── */}
                  {(q.type === "mcq_single" ||
                    q.type === "mcq_multiple" ||
                    q.type === "rating") && (
                    <Box>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ mb: 1, display: "block" }}
                      >
                        {q.type === "mcq_single"
                          ? "Select the correct answer"
                          : q.type === "mcq_multiple"
                            ? "Check all correct answers"
                            : "Add options for user selection (no correct answer)"}
                      </Typography>
                      <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                        {q.answers.map((ans, aIdx) => (
                          <Box key={aIdx} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            {q.type === "mcq_single" && (
                              <Radio
                                size="small"
                                checked={ans.isCorrect}
                                onChange={() => onSetSingleCorrect(qIdx, aIdx)}
                                sx={{ p: 0.5 }}
                              />
                            )}
                            {q.type === "mcq_multiple" && (
                              <Checkbox
                                size="small"
                                checked={ans.isCorrect}
                                onChange={(e) =>
                                  onUpdateAnswer(qIdx, aIdx, { isCorrect: e.target.checked })
                                }
                                sx={{ p: 0.5 }}
                              />
                            )}
                            <TextField
                              placeholder={`Option ${aIdx + 1}`}
                              value={ans.text}
                              onChange={(e) => onUpdateAnswer(qIdx, aIdx, { text: e.target.value })}
                              size="small"
                              fullWidth
                              sx={inputSx}
                            />
                            {q.answers.length > 1 && (
                              <IconButton
                                size="small"
                                onClick={() => onRemoveAnswer(qIdx, aIdx)}
                                sx={{ color: theme.palette.text.disabled }}
                              >
                                <CloseIcon fontSize="small" />
                              </IconButton>
                            )}
                          </Box>
                        ))}
                      </Box>
                      <Button
                        size="small"
                        startIcon={<AddIcon />}
                        onClick={() => onAddAnswer(qIdx)}
                        sx={{ mt: 1, textTransform: "none", color: theme.palette.primary.main }}
                      >
                        Add option
                      </Button>
                    </Box>
                  )}

                  {q.type === "feedback" && (
                    <TextField
                      placeholder="User can write their feedback here…"
                      multiline
                      rows={2}
                      fullWidth
                      size="small"
                      disabled
                      sx={{ ...inputSx, opacity: 0.6 }}
                    />
                  )}

                  {/* ── Reference links ── */}
                  <Divider sx={{ my: 1.5 }} />
                  <Box>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 1 }}>
                      <LinkIcon sx={{ fontSize: 16, color: theme.palette.text.secondary }} />
                      <Typography variant="caption" fontWeight={600} color="text.secondary">
                        Reference links
                      </Typography>
                    </Box>

                    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                      {(q.refLinks ?? []).map((link, lIdx) => (
                        <Box key={lIdx} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <TextField
                            placeholder="https://example.com/resource"
                            value={link}
                            onChange={(e) => onUpdateRefLink(qIdx, lIdx, e.target.value)}
                            size="small"
                            fullWidth
                            sx={inputSx}
                          />
                          <IconButton
                            size="small"
                            onClick={() => onRemoveRefLink(qIdx, lIdx)}
                            sx={{ color: theme.palette.text.disabled, flexShrink: 0 }}
                          >
                            <CloseIcon fontSize="small" />
                          </IconButton>
                        </Box>
                      ))}
                    </Box>

                    <Button
                      size="small"
                      startIcon={<AddIcon />}
                      onClick={() => onAddRefLink(qIdx)}
                      sx={{ mt: 0.75, textTransform: "none", color: theme.palette.text.secondary }}
                    >
                      Add link
                    </Button>
                  </Box>
                </Box>
              ))}
            </Box>
          )}

          <Button
            startIcon={<AddIcon />}
            onClick={onAddQuestion}
            variant="outlined"
            fullWidth
            sx={{
              mt: 2,
              textTransform: "none",
              borderRadius: 2,
              borderStyle: "dashed",
              color: theme.palette.text.secondary,
              borderColor: theme.palette.divider,
              "&:hover": {
                borderColor: theme.palette.primary.main,
                color: theme.palette.primary.main,
              },
            }}
          >
            Add question
          </Button>
        </Box>

        <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1.5, pt: 1 }}>
          <Button
            variant="outlined"
            onClick={onClose}
            sx={{ textTransform: "none", borderRadius: 8, px: 3 }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={onSave}
            disabled={isSaveDisabled}
            sx={{
              textTransform: "none",
              borderRadius: 8,
              px: 3,
              color: theme.palette.common.white,
              backgroundColor: theme.palette.primary.main,
            }}
          >
            {formSaving ? (
              <CircularProgress size={18} sx={{ color: theme.palette.common.white }} />
            ) : editingQuiz ? (
              "Update quiz"
            ) : (
              "Create quiz"
            )}
          </Button>
        </Box>
      </DialogContent>
    </Dialog>
  );
};

export default QuizDialogBox;
