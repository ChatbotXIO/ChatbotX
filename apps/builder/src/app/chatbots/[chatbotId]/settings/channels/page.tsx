import React from 'react'
import Channels from '../components/Channels'
import SettingTabs from '../views/SettingTabs'
import dynamic from 'next/dynamic'
// const Channels = dynamic(() => import('../components/Channels'))

const ChannelsPage = () => {
    return (
        <div className='px-16'>
            <SettingTabs />
            <Channels />
        </div>
    )
}

export default ChannelsPage