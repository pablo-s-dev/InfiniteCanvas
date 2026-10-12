const { createRunOncePlugin, withAndroidStyles, AndroidConfig } = require('@expo/config-plugins');

function setForceDarkModeToFalse(styles) {
    styles = AndroidConfig.Styles.assignStylesValue(styles, {
        add: true,
        parent: AndroidConfig.Styles.getAppThemeGroup(),
        name: `android:forceDarkAllowed`,
        value: "false",
    });
    styles = AndroidConfig.Styles.assignStylesValue(styles, {
        add: true,
        parent: AndroidConfig.Styles.getAppThemeGroup(),
        name: `android:windowLightNavigationBar`,
        value: "false",
    });
    return styles;
}

const disableForcedDarkModeAndroid = (config) => {
    return withAndroidStyles(config, (config) => {
        config.modResults = setForceDarkModeToFalse(config.modResults);
        return config;
    });
};

module.exports = createRunOncePlugin(disableForcedDarkModeAndroid, 'disable-forced-dark-mode', '1.0.0');
