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

import Typography from "@mui/material/Typography";
import { Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, Stack, alpha } from "@mui/material";
import { useAppAuthContext } from "@context/AuthContext";

interface ConsentHandlerProps {
  setUserConsent: (value: boolean) => void;
}

const ConsentHandler = ({ setUserConsent }: ConsentHandlerProps) => {
  const authContext = useAppAuthContext();

  return (
    <Box>
      <Dialog
        open={true}
        sx={{
          backgroundImage: "linear-gradient(rgba(0, 0, 0, 1), rgba(0, 0, 0, 0.5)), url(/consent.svg)",
          backgroundSize: "cover",
          backdropFilter: "blur(5px)",
          ".MuiDialog-paper": {
            maxWidth: 460,
            minHeight: 440,
            borderRadius: 10,
            boxShadow: 2,
            backgroundColor: (theme) => alpha(theme.palette.secondary.light, 1),
          },
        }}
      >
        <DialogContent sx={{ m: 0, p: 1, px: 6, pt: 6 }}>
          <Stack alignItems={"center"} rowGap={3}>
            <img alt="logo" width="220" height="auto" src="/consent.svg"></img>
            <DialogContentText color={"secondary.dark"} sx={{ fontWeight: 700, textAlign: "center", fontSize: 40 }}>
              User Consent
            </DialogContentText>
          </Stack>
          <DialogContentText color={"CaptionText"} sx={{ textAlign: "center", fontSize: 13, my: 2 }}>
            To enhance your experience, we track how the Sales Pitstop web app is used. We
            collect your{" "}
            <Typography sx={{ fontWeight: 700, fontSize: 13 }}>email, team, and department details</Typography> to
            improve our services. By continuing, you consent to this tracking.
          </DialogContentText>
        </DialogContent>

        <DialogActions sx={{ m: 0, p: 0, gap: 0, justifyContent: "space-between" }} disableSpacing>
          <Button
            variant="contained"
            color="inherit"
            sx={{ flex: 1, py: 2, boxShadow: "none", borderRadius: 0, m: 0, width: "auto" }}
            onClick={() => {
              setUserConsent(false);
              authContext.appSignOut();
            }}
          >
            Decline & Sign Out
          </Button>
          <Button
            variant="contained"
            color="primary"
            sx={{ flex: 1, py: 2, boxShadow: "none", borderRadius: 0, width: "auto" }}
            onClick={() => setUserConsent(true)}
          >
            Agree & Continue
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ConsentHandler;
