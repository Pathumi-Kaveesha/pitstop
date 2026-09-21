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

import SearchIcon from "@mui/icons-material/Search";
import { Fab, Tooltip } from "@mui/material";
import { useNavigate } from "react-router-dom";

// A shortcut into the search page, shown on every page.
export default function LibrarySearchButton() {
  const navigate = useNavigate();

  return (
    <Tooltip title="Search these documents" placement="right">
      <Fab
        color="primary"
        aria-label="Search these documents"
        onClick={() => navigate("/smart-search-poc")}
        sx={{
          position: "fixed",
          // Clears the fixed footer bar (35px) instead of sitting on top of it.
          bottom: "51px",
          left: (theme) => theme.spacing(2),
          zIndex: (theme) => theme.zIndex.speedDial,
        }}
      >
        <SearchIcon />
      </Fab>
    </Tooltip>
  );
}
