import React from 'react'
import General from '../components/General'
import SettingTabs from '../views/SettingTabs'

const GeneralPage = () => {
    return (
        <div className='px-16'>
            <SettingTabs />
            <General />
        </div>
    )
}

export default GeneralPage