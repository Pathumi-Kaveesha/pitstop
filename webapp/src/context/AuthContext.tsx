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

import { setUserAuthData, loadPrivileges } from "@slices/authSlice";
import { useAppDispatch } from "@slices/store";
import StatusWithAction from "@components/ui/StatusWithAction";
import PreLoader from "@components/common/PreLoader";
import { getRoutesInfo } from "@slices/routeSlice/route";
import React, { useContext, useEffect, useState } from "react";
import { Button } from "@mui/material";
import { ApiService } from "@utils/apiService";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import { useAuthContext, SecureApp } from "@asgardeo/auth-react";

interface AuthContextType {
  appSignIn: () => void;
  appSignOut: () => void;
}

type AppState = "logout" | "active" | "loading";
const AuthContext = React.createContext<AuthContextType>({} as AuthContextType);

const AppAuthProvider = (props: { children: React.ReactNode }) => {
  const [open, setOpen] = useState<boolean>(false);
  const [appState, setAppState] = useState<AppState>("loading");

  const dispatch = useAppDispatch();

  const {
    signIn,
    signOut,
    getDecodedIDToken,
    getBasicUserInfo,
    refreshAccessToken,
    isAuthenticated,
    getIDToken,
    state,
  } = useAuthContext();

  useEffect(() => {
    const appStatus = localStorage.getItem("hris-app-state");

    if (!localStorage.getItem("hris-app-redirect-url")) {
      localStorage.setItem(
        "hris-app-redirect-url",
        window.location.href.replace(window.location.origin, "")
      );
    }

    if (appStatus && appStatus === "logout") {
      setAppState("logout");
    } else {
      setAppState("active");
    }
  }, []);

  useEffect(() => {
    const isSignInInitiated =
      localStorage.getItem("signInInitiated") === "true";
    if (state.isAuthenticated) {
      Promise.all([getBasicUserInfo(), getIDToken(), getDecodedIDToken()]).then(
        async ([userInfo, idToken, decodedIdToken]) => {
          dispatch(
            setUserAuthData({
              userInfo: userInfo,
              idToken: idToken,
              decodedIdToken: decodedIdToken,
            })
          );

          new ApiService(idToken, refreshToken);
          await dispatch(loadPrivileges());

          await dispatch(getRoutesInfo(window.location.pathname));
          localStorage.setItem("signInInitiated", "false");
        }
      );
    } else if (!isSignInInitiated) {
      localStorage.setItem("signInInitiated", "true");
      signIn();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isAuthenticated]);

  useEffect(() => {
    const isSignInInitiated =
      localStorage.getItem("signInInitiated") === "true";

    if (appState === "active" && !state.isAuthenticated && !isSignInInitiated) {
      localStorage.setItem("signInInitiated", "true");
      signIn();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isAuthenticated, appState]);

  const refreshToken = () => {
    return new Promise<{ idToken: string }>((resolve) => {
      isAuthenticated().then((userIsAuthenticated) => {
        if (userIsAuthenticated) {
          getIDToken().then((idToken) => {
            resolve({ idToken });
          });
        } else {
          refreshAccessToken()
            .then(async () => {
              const idToken = await getIDToken();
              resolve({ idToken: idToken });
            })
            .catch(() => {
              appSignOut();
            });
        }
      });
    });
  };

  const appSignOut = async () => {
    setAppState("loading");
    localStorage.setItem("hris-app-state", "logout");
    await signOut();
    setAppState("logout");
  };

  const appSignIn = async () => {
    setAppState("active");
    localStorage.setItem("hris-app-state", "active");
  };

  const authContext: AuthContextType = {
    appSignIn: appSignIn,
    appSignOut: appSignOut,
  };

  return (
    <>
      {state.isLoading ? (
        <PreLoader isLoading={true} />
      ) : (
        <>
          <Dialog
            open={open}
            onClose={() => setOpen(false)}
            aria-labelledby="alert-dialog-title"
            aria-describedby="alert-dialog-description"
          >
            <DialogTitle id="alert-dialog-title">
              {"Are you still there?"}
            </DialogTitle>
            <DialogContent>
              <DialogContentText id="alert-dialog-description">
                It looks like you've been inactive for a while. Would you like
                to continue?
              </DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setOpen(false)}>Continue</Button>
              <Button onClick={() => appSignOut()}>Logout</Button>
            </DialogActions>
          </Dialog>
          {appState === "active" ? (
            <AuthContext.Provider value={authContext}>
              <SecureApp>{props.children}</SecureApp>
            </AuthContext.Provider>
          ) : (
            <StatusWithAction action={() => appSignIn()} />
          )}
        </>
      )}
    </>
  );
};

const useAppAuthContext = (): AuthContextType => useContext(AuthContext);
// eslint-disable-next-line react-refresh/only-export-components
export { useAppAuthContext };
export default AppAuthProvider;
