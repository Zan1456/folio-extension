async function transformTwoFactorPage() {
  try {
    while (
      typeof window.LanguageManager === "undefined" ||
      !window.LanguageManager.t("two_factor.title") ||
      window.LanguageManager.t("two_factor.title") === "two_factor.title"
    ) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    if (document.readyState !== "complete") {
      await new Promise((resolve) => {
        window.addEventListener("load", resolve);
      });
    }

    if (typeof loadingScreen !== "undefined") {
      loadingScreen.show();
    }

    const formData = {
      clientId: document.querySelector("#ClientId")?.value || "",
      rememberLogin: document.querySelector("#RememberLogin")?.value || "False",
      returnUrl: document.querySelector("#ReturnUrl")?.value || "",
      verificationType: document.querySelector("#VerificationType")?.value || "Totp",
      predefinedVerificationValue: document.querySelector("#PredefinedVerificationValue")?.value || "",
      requestToken:
        document.querySelector('input[name="__RequestVerificationToken"]')
          ?.value || "",
    };

    const newHTML = `
      <div class="login-container">
        <div class="login-card">
          <div class="card-header">
            <p class="logo-text">
              <img src=${chrome.runtime.getURL("images/folio_logo.png")} alt="Folio" class="logo">
              Folio
            </p>
            <h1 class="twofactor-title">${LanguageManager.t("two_factor.title")}</h1>
            <span class="twofactor-subtitle">${LanguageManager.t("two_factor.instruction")}</span>
          </div>

          <form class="twofactor-form" method="post" id="twoFactorForm" novalidate>
            <input type="hidden" id="ClientId" name="ClientId" value="${formData.clientId}">
            <input type="hidden" id="RememberLogin" name="RememberLogin" value="${formData.rememberLogin}">
            <input type="hidden" id="ReturnUrl" name="ReturnUrl" value="${formData.returnUrl}">
            <input type="hidden" id="VerificationType" name="VerificationType" value="${formData.verificationType}">
            <input type="hidden" id="PredefinedVerificationValue" name="PredefinedVerificationValue" value="${formData.predefinedVerificationValue}">
            <input name="__RequestVerificationToken" type="hidden" value="${formData.requestToken}">

            <div class="otp-group">
              <input id="VerificationValue_0" name="VerificationValue" class="otp-input" type="text" inputmode="numeric" pattern="[0-9]" maxlength="1" autocomplete="one-time-code" autofocus>
              <input id="VerificationValue_1" name="VerificationValue" class="otp-input" type="text" inputmode="numeric" pattern="[0-9]" maxlength="1">
              <input id="VerificationValue_2" name="VerificationValue" class="otp-input" type="text" inputmode="numeric" pattern="[0-9]" maxlength="1">
              <span class="otp-separator">–</span>
              <input id="VerificationValue_3" name="VerificationValue" class="otp-input" type="text" inputmode="numeric" pattern="[0-9]" maxlength="1">
              <input id="VerificationValue_4" name="VerificationValue" class="otp-input" type="text" inputmode="numeric" pattern="[0-9]" maxlength="1">
              <input id="VerificationValue_5" name="VerificationValue" class="otp-input" type="text" inputmode="numeric" pattern="[0-9]" maxlength="1">
            </div>

            <div id="otp-error" class="error-message" style="display:none;">${LanguageManager.t("two_factor.code_required")}</div>

            <div class="form-check mt-3">
              <input class="form-check-input" type="checkbox" id="trustDevice" name="TrustDevice" value="true">
              <label class="form-check-label" for="trustDevice">
                ${LanguageManager.t("two_factor.trust_device")}
              </label>
              <input name="TrustDevice" type="hidden" value="false">
            </div>

            <div class="d-flex justify-content-center mb-3 mt-4">
              <button type="submit" class="btn-kreta" id="verifyBtn" formaction="/account/loginwithtwofactor">${LanguageManager.t("two_factor.verify_button")}</button>
            </div>

            <div class="d-flex justify-content-center mt-3">
              <span class="subtext">
                ${LanguageManager.t("two_factor.no_access")}
                <button type="submit" class="btn-link" formaction="/account/loginwithtwofactorrecoverycode">
                  ${LanguageManager.t("two_factor.recovery_code")}
                </button>
              </span>
            </div>
          </form>
        </div>

        <footer class="login-footer">
          <a href="https://tudasbazis.ekreta.hu/pages/viewpage.action?pageId=4064926"
             target="_blank" class="privacy-link">${LanguageManager.t("login.privacy_policy")}</a>
        </footer>
      </div>
    `;

    const template = document.createElement('template');
    template.innerHTML = newHTML;

    helper.clearElement(document.body);
    document.body.appendChild(template.content);

    applyTheme();
    setupEventListeners();
    if (typeof loadingScreen !== "undefined") {
      loadingScreen.hide();
    }
  } catch (error) {
    if (typeof loadingScreen !== "undefined") {
      loadingScreen.hide();
    }
  }
}

function applyTheme() {
  try {
    const theme = localStorage.getItem("themePreference") || "light-green";
    document.documentElement.setAttribute("data-theme", theme);
  } catch (error) {
  }
}

function setupEventListeners() {
  const twoFactorForm = document.getElementById("twoFactorForm");
  const otpInputs = Array.from(document.querySelectorAll(".otp-input"));

  otpInputs.forEach((input, index) => {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Backspace") {
        if (input.value.length > 0) {
          input.value = "";
        } else if (index > 0) {
          otpInputs[index - 1].focus();
          otpInputs[index - 1].value = "";
        }
        e.preventDefault();
      } else if (e.key === "ArrowLeft" && index > 0) {
        otpInputs[index - 1].focus();
        e.preventDefault();
      } else if (e.key === "ArrowRight" && index < otpInputs.length - 1) {
        otpInputs[index + 1].focus();
        e.preventDefault();
      }
    });

    input.addEventListener("input", () => {
      const val = input.value.replace(/[^0-9]/g, "");
      input.value = val.slice(-1);
      hideOtpError();
      if (input.value && index < otpInputs.length - 1) {
        otpInputs[index + 1].focus();
      }
    });

    input.addEventListener("paste", (e) => {
      e.preventDefault();
      const pasted = e.clipboardData
        .getData("text")
        .replace(/[^0-9]/g, "")
        .slice(0, 6);
      pasted.split("").forEach((char, i) => {
        if (otpInputs[index + i]) {
          otpInputs[index + i].value = char;
        }
      });
      const nextEmpty = otpInputs.find((inp) => !inp.value);
      (nextEmpty || otpInputs[otpInputs.length - 1]).focus();
      hideOtpError();
    });

    input.addEventListener("focus", () => {
      input.select();
    });
  });

  if (twoFactorForm) {
    twoFactorForm.addEventListener("submit", handleSubmit);
  }
}

function hideOtpError() {
  const err = document.getElementById("otp-error");
  if (err) err.style.display = "none";
  document.querySelectorAll(".otp-input").forEach((inp) => inp.classList.remove("error"));
}

function getOtpValue() {
  return Array.from(document.querySelectorAll(".otp-input"))
    .map((inp) => inp.value)
    .join("");
}

function handleSubmit(event) {
  const otpValue = getOtpValue();

  if (otpValue.length < 6) {
    event.preventDefault();
    const err = document.getElementById("otp-error");
    if (err) err.style.display = "block";
    document.querySelectorAll(".otp-input").forEach((inp) => {
      if (!inp.value) inp.classList.add("error");
    });
    document.querySelector(".otp-input:not([value])")?.focus() ||
      document.getElementById("VerificationValue_0")?.focus();
    return;
  }

  const verifyBtn = document.getElementById("verifyBtn");
  if (event.submitter === verifyBtn || event.submitter?.formAction?.includes("loginwithtwofactor")) {
    verifyBtn.disabled = true;
    helper.clearElement(verifyBtn);
    const spinnerSpan = document.createElement('span');
    spinnerSpan.className = 'spinner';
    const textSpan = document.createElement('span');
    textSpan.className = 'btn-text';
    textSpan.textContent = LanguageManager.t('two_factor.verifying');
    verifyBtn.appendChild(spinnerSpan);
    verifyBtn.appendChild(textSpan);
  }
}

transformTwoFactorPage();
